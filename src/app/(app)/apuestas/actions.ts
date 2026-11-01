'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validarFormulario } from '@/lib/apuestas/formulario'
import { BUCKET, esRutaPropia, registrarError, usuarioActual } from '@/lib/server/capturas'
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
}): Promise<ResultadoGuardar> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, error: SIN_SESION }

    const id = entrada?.id ?? null
    if (id !== null && (typeof id !== 'string' || !UUID.test(id))) return { ok: false, error: 'Apuesta no válida.' }
    const imagen = entrada?.imagen ?? null
    if (imagen !== null && !esRutaPropia(imagen, userId)) return { ok: false, error: 'Captura no válida.' }

    const v = validarFormulario(entrada?.valores)
    if (!v.ok) return { ok: false, error: 'Revisa los campos marcados.', errores: v.errores }

    const { selecciones, ...apuesta } = v.datos
    const { data, error } = await supabase.rpc('guardar_apuesta', {
      p_id: id,
      p_apuesta: { ...apuesta, imagen_origen: id ? null : imagen },
      p_selecciones: selecciones,
    })
    if (error) {
      registrarError('apuestas:guardar', error)
      if (error.code === 'P0002') return { ok: false, error: 'Esa apuesta ya no existe.' }
      if (error.code === '23503') return { ok: false, error: 'La casa o la estrategia elegida ya no existe. Elige otra.' }
      return { ok: false, error: FALLO }
    }
    revalidatePath('/apuestas')
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

    const { data, error } = await supabase.from('apuestas').delete().eq('id', id).select('imagen_origen')
    if (error) {
      registrarError('apuestas:borrar', error)
      return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
    }
    if (!data?.length) return { ok: false, error: 'Esa apuesta ya no existe.' }
    const imagen = data[0].imagen_origen
    if (esRutaPropia(imagen, userId)) {
      const { error: e2 } = await supabase.storage.from(BUCKET).remove([imagen])
      if (e2) registrarError('capturas:borrar', e2)
    }
    revalidatePath('/apuestas')
    return { ok: true }
  } catch (e) {
    registrarError('apuestas:borrar', e)
    return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
  }
}

// Borra una captura subida que al final no se guarda (solo si ninguna apuesta la usa).
export async function descartarCaptura(ruta: string): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId || !esRutaPropia(ruta, userId)) return { ok: false }
    const { count } = await supabase
      .from('apuestas')
      .select('id', { count: 'exact', head: true })
      .eq('imagen_origen', ruta)
    if ((count ?? 0) > 0) return { ok: true }
    const { error } = await supabase.storage.from(BUCKET).remove([ruta])
    if (error) registrarError('capturas:descartar', error)
    return { ok: !error }
  } catch (e) {
    registrarError('capturas:descartar', e)
    return { ok: false }
  }
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
