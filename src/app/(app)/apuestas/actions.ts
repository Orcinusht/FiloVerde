'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarFormulario } from '@/lib/apuestas/formulario'
import { claveHuella, esCalcada, type HuellaApuesta, type HuellaSeleccion } from '@/lib/apuestas/duplicadas'
import { esRutaPropia, registrarError, usuarioActual } from '@/lib/server/capturas'
import { limpiarImagenSiNoSeUsa } from '@/lib/server/pendientes'
import * as catalogo from '@/lib/server/acciones-catalogo'
import type { Opcion } from '@/lib/apuestas/formulario'

// Acciones de servidor: TODO lo que llega del navegador se vuelve a validar aquí.

export type ResultadoGuardar =
  | { ok: true; id: string; avisos: string[] }
  | { ok: false; error: string; errores?: Record<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.'
const FALLO = 'No se ha podido guardar. Inténtalo de nuevo.'

export async function guardarApuesta(entrada: {
  id?: string | null
  valores: unknown
  imagen?: string | null
  // De qué lectura de la IA y qué apuesta de la captura viene (si viene de una).
  transcripcionId?: string | null
  indice?: number | null
  // En una cola de varias apuestas, la imagen se conserva hasta «Terminar» (para poder volver).
  conservarImagen?: boolean
}): Promise<ResultadoGuardar> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, error: SIN_SESION }

    const id = entrada?.id ?? null
    if (id !== null && (typeof id !== 'string' || !UUID.test(id))) return { ok: false, error: 'Apuesta no válida.' }
    const imagen = entrada?.imagen ?? null
    if (imagen !== null && !esRutaPropia(imagen, userId)) return { ok: false, error: 'Captura no válida.' }
    const transcripcionId = entrada?.transcripcionId ?? null
    const indice = entrada?.indice ?? null
    if (transcripcionId !== null && (typeof transcripcionId !== 'string' || !UUID.test(transcripcionId)))
      return { ok: false, error: 'Lectura no válida.' }
    if (transcripcionId !== null && !(Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < 50))
      return { ok: false, error: 'Lectura no válida.' }

    const v = validarFormulario(entrada?.valores)
    if (!v.ok) return { ok: false, error: 'Revisa los campos marcados.', errores: v.errores }

    const { selecciones, ...apuesta } = v.datos
    const { data, error } = await supabase.rpc('guardar_apuesta', {
      p_id: id,
      p_apuesta: {
        ...apuesta,
        // La captura es temporal: la apuesta nunca guarda el enlace a la imagen.
        imagen_origen: null,
        transcripcion_id: id ? null : transcripcionId,
        transcripcion_indice: id || transcripcionId === null ? null : indice,
      },
      p_selecciones: selecciones,
    })
    if (error) {
      registrarError('apuestas:guardar', error)
      if (error.code === 'P0002') return { ok: false, error: 'Esa apuesta ya no existe.' }
      if (error.code === '23503') return { ok: false, error: 'La casa o la estrategia elegida ya no existe. Elige otra.' }
      if (error.code === '23505') return { ok: false, error: 'Esta apuesta ya estaba guardada.' }
      if (error.code === '22023' && error.hint === 'deporte')
        return { ok: false, error: 'Cada selección necesita su deporte (y «Mixto» no vale como deporte).' }
      return { ok: false, error: FALLO }
    }
    revalidatePath('/apuestas')
    // Guardado OK → se borra la captura (si ya no queda ninguna apuesta suya por revisar).
    // Va después de responder; si falla, no se avisa: se reintenta más tarde.
    if (imagen && entrada?.conservarImagen !== true) {
      after(async () => {
        try {
          await limpiarImagenSiNoSeUsa(await createClient(), imagen)
        } catch (e) {
          registrarError('capturas:borrar-tras-guardar', e)
        }
      })
    }
    return { ok: true, id: data as string, avisos: v.avisos }
  } catch (e) {
    registrarError('apuestas:guardar', e)
    return { ok: false, error: FALLO }
  }
}

export async function borrarApuesta(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'Apuesta no válida.' }
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, error: SIN_SESION }

    const { data, error } = await supabase
      .from('apuestas')
      .delete()
      .eq('id', id)
      .select('imagen_origen, transcripcion_id, transcripcion_indice')
    if (error) {
      registrarError('apuestas:borrar', error)
      return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
    }
    if (!data?.length) return { ok: false, error: 'Esa apuesta ya no existe.' }
    // Si venía de una lectura de la IA, no debe volver a ofrecerse como "sin revisar".
    const { transcripcion_id, transcripcion_indice } = data[0]
    if (transcripcion_id && transcripcion_indice != null) await marcarDescartada(supabase, transcripcion_id, transcripcion_indice)
    // La captura solo se borra si ninguna otra apuesta la usa ni queda otra por revisar.
    const imagen = data[0].imagen_origen
    if (esRutaPropia(imagen, userId)) await limpiarImagenSiNoSeUsa(supabase, imagen)
    revalidatePath('/apuestas')
    return { ok: true }
  } catch (e) {
    registrarError('apuestas:borrar', e)
    return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
  }
}

// Descarta una apuesta de la cola de revisión (o una captura que no se pudo leer).
// Si viene de una lectura de la IA, se apunta como descartada para no volver a ofrecerla.
// La imagen se borra solo si ya no la usa nadie (ver limpiarImagenSiNoSeUsa).
export async function descartarCaptura(entrada: {
  ruta?: string | null
  transcripcionId?: string | null
  indice?: number | null
  conservarImagen?: boolean
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false }
    const { ruta, transcripcionId, indice } = entrada ?? {}
    const conservar = entrada?.conservarImagen === true

    if (transcripcionId != null) {
      if (typeof transcripcionId !== 'string' || !UUID.test(transcripcionId)) return { ok: false }
      if (!(Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < 50)) return { ok: false }
      if (!(await marcarDescartada(supabase, transcripcionId, indice as number))) return { ok: false }
    }
    if (ruta != null) {
      if (!esRutaPropia(ruta, userId)) return { ok: false }
      if (!conservar) await limpiarImagenSiNoSeUsa(supabase, ruta)
    }
    revalidatePath('/apuestas')
    return { ok: true }
  } catch (e) {
    registrarError('capturas:descartar', e)
    return { ok: false }
  }
}

// Volver a una apuesta descartada en la cola: deja de estar descartada (vuelve a "sin revisar").
export async function recuperarDescartada(entrada: { transcripcionId?: unknown; indice?: unknown }): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    if (!(await usuarioActual(supabase))) return { ok: false }
    const { transcripcionId, indice } = entrada ?? {}
    if (typeof transcripcionId !== 'string' || !UUID.test(transcripcionId)) return { ok: false }
    if (!(Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < 50)) return { ok: false }
    const { data, error } = await supabase.from('transcripciones').select('descartadas').eq('id', transcripcionId).maybeSingle()
    if (error || !data) return { ok: false }
    const descartadas = (data.descartadas ?? []).filter((x: number) => x !== indice)
    const { error: e2 } = await supabase.from('transcripciones').update({ descartadas }).eq('id', transcripcionId)
    if (e2) registrarError('transcripciones:recuperar', e2)
    return { ok: !e2 }
  } catch (e) {
    registrarError('transcripciones:recuperar', e)
    return { ok: false }
  }
}

// Fin de una cola de varias apuestas («Terminar» o salir): se borran las capturas que ya no
// usa nadie (las que aún tienen apuestas sin revisar se conservan). Si algo falla, el borrado
// automático de las 2 horas lo recoge.
export async function terminarCola(rutas: unknown): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId || !Array.isArray(rutas)) return { ok: false }
    const propias = [...new Set(rutas)].filter((r): r is string => esRutaPropia(r, userId)).slice(0, 20)
    for (const r of propias) {
      try {
        await limpiarImagenSiNoSeUsa(supabase, r)
      } catch (e) {
        registrarError('capturas:borrar-al-terminar', e)
      }
    }
    revalidatePath('/apuestas')
    return { ok: true }
  } catch (e) {
    registrarError('capturas:terminar-cola', e)
    return { ok: false }
  }
}

// Apunta en la lectura de la IA que esa apuesta de la captura no se va a guardar.
async function marcarDescartada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  transcripcionId: string,
  indice: number,
): Promise<boolean> {
  const { data, error } = await supabase.from('transcripciones').select('descartadas').eq('id', transcripcionId).maybeSingle()
  if (error || !data) return false
  const descartadas = [...new Set([...(data.descartadas ?? []), indice])].sort((a, b) => a - b)
  const { error: e2 } = await supabase.from('transcripciones').update({ descartadas }).eq('id', transcripcionId)
  if (e2) registrarError('transcripciones:descartar', e2)
  return !e2
}

async function crearOpcion(tabla: 'casas_apuestas' | 'estrategias', nombre: unknown) {
  const limpio = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
  if (limpio.length < 1 || limpio.length > 80) return { ok: false as const, error: 'Escribe un nombre (máx. 80 letras).' }
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false as const, error: SIN_SESION }

    // Si ya existe (sin mirar mayúsculas), se usa la existente.
    const { data: existentes } = await supabase.from(tabla).select('id, nombre').ilike('nombre', limpio.replace(/[%_\\]/g, '\\$&'))
    if (existentes?.length) return { ok: true as const, opcion: existentes[0] as Opcion }

    const { data, error } = await supabase.from(tabla).insert({ nombre: limpio }).select('id, nombre').single()
    if (error) {
      registrarError(`${tabla}:crear`, error)
      return { ok: false as const, error: 'No se ha podido crear. Inténtalo de nuevo.' }
    }
    return { ok: true as const, opcion: data as Opcion }
  } catch (e) {
    registrarError(`${tabla}:crear`, e)
    return { ok: false as const, error: 'No se ha podido crear. Inténtalo de nuevo.' }
  }
}

export async function crearCasa(nombre: string) {
  return crearOpcion('casas_apuestas', nombre)
}

export async function crearEstrategia(nombre: string) {
  return crearOpcion('estrategias', nombre)
}

// ---------- Catálogo de deportes y ligas (desde el formulario) ----------

export async function crearDeporte(nombre: string) {
  return catalogo.crearDeporte(nombre)
}

export async function crearLiga(deporte: string, nombre: string) {
  return catalogo.crearLiga(deporte, nombre)
}

// ---------- Aviso de apuesta duplicada ----------
// Busca entre MIS apuestas (con mi sesión: RLS; nunca con la clave de administrador) una copia
// calcada de la que estoy a punto de guardar. Solo para apuestas nuevas, nunca al editar.

export type ResultadoDuplicadas =
  | {
      ok: true
      total: number
      clave: string // huella de los datos comprobados (para "Incluir de nuevo")
      reciente: { fecha: string; estado: string; casa: string | null; importe: number; cuota: number | null; divisa: string } | null
    }
  | { ok: false }

export async function buscarDuplicadas(entrada: { valores: unknown; casaPendiente?: unknown }): Promise<ResultadoDuplicadas> {
  try {
    const v = validarFormulario(entrada?.valores)
    if (!v.ok) return { ok: true, total: 0, clave: '', reciente: null } // incompleta: nada que comparar
    const d = v.datos
    const huella: HuellaApuesta = {
      casa_id: d.casa_id,
      tipo: d.tipo,
      importe: d.importe,
      cuota_total: d.cuota_total,
      ganancia_potencial: d.ganancia_potencial,
      selecciones: d.selecciones.map((s) => ({
        evento: s.evento,
        mercado: s.mercado,
        pronostico: s.pronostico,
        cuota: s.cuota,
        evento_fecha: s.evento_fecha,
      })),
    }
    const clave = claveHuella(huella)
    // Una casa leída por la IA que aún no está en el catálogo no coincide con nada.
    if (entrada?.casaPendiente === true) return { ok: true, total: 0, clave, reciente: null }

    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false }

    let q = supabase
      .from('apuestas')
      .select(
        'id, fecha, estado, divisa, casa_id, tipo, importe, cuota_total, ganancia_potencial, casas_apuestas(nombre), selecciones(evento, mercado, pronostico, cuota, evento_fecha)',
      )
      .eq('importe', d.importe)
      .eq('tipo', d.tipo)
      .order('fecha', { ascending: false })
      .limit(100)
    q = d.casa_id ? q.eq('casa_id', d.casa_id) : q.is('casa_id', null)
    q = d.cuota_total == null ? q.is('cuota_total', null) : q.eq('cuota_total', d.cuota_total)
    const { data, error } = await q
    if (error) throw error

    const iguales = (data ?? []).filter((a) =>
      esCalcada(huella, {
        casa_id: a.casa_id,
        tipo: a.tipo,
        importe: Number(a.importe),
        cuota_total: a.cuota_total == null ? null : Number(a.cuota_total),
        ganancia_potencial: a.ganancia_potencial == null ? null : Number(a.ganancia_potencial),
        selecciones: ((a.selecciones ?? []) as HuellaSeleccion[]).map((s) => ({
          ...s,
          cuota: s.cuota == null ? null : Number(s.cuota),
        })),
      }),
    )
    const r = iguales[0]
    return {
      ok: true,
      total: iguales.length,
      clave,
      reciente: r
        ? {
            fecha: r.fecha,
            estado: r.estado,
            casa: (r.casas_apuestas as unknown as { nombre: string } | null)?.nombre ?? null,
            importe: Number(r.importe),
            cuota: r.cuota_total == null ? null : Number(r.cuota_total),
            divisa: r.divisa,
          }
        : null,
    }
  } catch (e) {
    // No bloquea el guardado: el error va al log (sin datos personales).
    registrarError('apuestas:duplicadas', e)
    return { ok: false }
  }
}
