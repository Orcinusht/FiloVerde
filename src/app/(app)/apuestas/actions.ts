'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarFormulario } from '@/lib/apuestas/formulario'
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
    if (imagen) {
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
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false }
    const { ruta, transcripcionId, indice } = entrada ?? {}

    if (transcripcionId != null) {
      if (typeof transcripcionId !== 'string' || !UUID.test(transcripcionId)) return { ok: false }
      if (!(Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < 50)) return { ok: false }
      if (!(await marcarDescartada(supabase, transcripcionId, indice as number))) return { ok: false }
    }
    if (ruta != null) {
      if (!esRutaPropia(ruta, userId)) return { ok: false }
      await limpiarImagenSiNoSeUsa(supabase, ruta)
    }
    revalidatePath('/apuestas')
    return { ok: true }
  } catch (e) {
    registrarError('capturas:descartar', e)
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
