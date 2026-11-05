'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from './capturas'
import { motivoNoBorrable, validarNombreOpcion, type OpcionGestion, type TipoOpcion, type Uso } from '@/lib/apuestas/opciones'
import { leerOpciones } from './opciones'

// Gestión de casas de apuestas y estrategias (Ajustes) y creación al vuelo desde los formularios.
// Siempre con la sesión del usuario (RLS): el usuario sale de la sesión, nunca del navegador.
// Las reglas se comprueban aquí y la base de datos las repite. Errores: mensaje en español y el
// error real al log ([casas:…] / [estrategias:…]), sin datos personales.

export type Respuesta<T = null> = { ok: true; dato: T; mensaje?: string } | { ok: false; error: string; existente?: OpcionGestion }

const TABLA: Record<TipoOpcion, 'casas_apuestas' | 'estrategias'> = { casa: 'casas_apuestas', estrategia: 'estrategias' }
const LOG: Record<TipoOpcion, string> = { casa: 'casas', estrategia: 'estrategias' }
const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.'
const FALLO = 'No se ha podido guardar. Inténtalo de nuevo en un momento.'
const esTipo = (t: unknown): t is TipoOpcion => t === 'casa' || t === 'estrategia'
const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

async function sesion() {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  return { supabase, userId }
}

// Uso de UNA casa o estrategia (para decidir si se puede borrar), contado en la base de datos.
async function usoDe(supabase: SupabaseClient, userId: string, tipo: TipoOpcion, id: string): Promise<Uso> {
  const col = tipo === 'casa' ? 'casa_id' : 'estrategia_id'
  const ap = await supabase.from('apuestas').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq(col, id)
  if (ap.error) throw ap.error
  let movimientos = 0
  if (tipo === 'casa') {
    const m1 = await supabase.from('movimientos_bankroll').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('casa_id', id)
    const m2 = await supabase.from('movimientos_bankroll').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('casa_destino_id', id)
    if (m1.error) throw m1.error
    if (m2.error) throw m2.error
    movimientos = (m1.count ?? 0) + (m2.count ?? 0)
  }
  return { apuestas: ap.count ?? 0, movimientos }
}

function mensajeBD(tipo: TipoOpcion, e: { code?: string; hint?: string; message?: string }): string {
  if (e.code === '23505') return `Ya tienes ${tipo === 'casa' ? 'una casa' : 'una estrategia'} con ese nombre.`
  if (e.code === '23514') return 'Ese nombre está reservado o no es válido. Elige otro.'
  if (e.code === '23503' || e.hint === 'en_uso') return `${tipo === 'casa' ? 'Esta casa' : 'Esta estrategia'} está en uso: no se puede borrar. Puedes renombrarla o archivarla.`
  return FALLO
}

const refrescar = () => revalidatePath('/', 'layout')

// Crear. Si ya existe (también archivada), no crea otra: devuelve la existente para usarla.
export async function crearOpcion(tipo: TipoOpcion, nombre: unknown): Promise<Respuesta<OpcionGestion>> {
  if (!esTipo(tipo)) return { ok: false, error: FALLO }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const v = validarNombreOpcion(tipo, nombre, await leerOpciones(supabase, userId, tipo))
    if (!v.ok) return { ok: false, error: v.error, existente: v.existente }
    const { data, error } = await supabase.from(TABLA[tipo]).insert({ nombre: v.nombre }).select('id, nombre, archivada').single()
    if (error) {
      registrarError(`${LOG[tipo]}:crear`, error)
      return { ok: false, error: mensajeBD(tipo, error) }
    }
    refrescar()
    return { ok: true, dato: data as OpcionGestion, mensaje: `«${v.nombre}» creada.` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:crear`, e)
    return { ok: false, error: FALLO }
  }
}

export async function renombrarOpcion(tipo: TipoOpcion, id: unknown, nombre: unknown): Promise<Respuesta> {
  if (!esTipo(tipo) || !esId(id)) return { ok: false, error: FALLO }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const existentes = await leerOpciones(supabase, userId, tipo)
    if (!existentes.some((o) => o.id === id)) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    const v = validarNombreOpcion(tipo, nombre, existentes, id)
    if (!v.ok) return { ok: false, error: v.error }
    const { data, error } = await supabase.from(TABLA[tipo]).update({ nombre: v.nombre }).eq('id', id).eq('user_id', userId).select('id')
    if (error) {
      registrarError(`${LOG[tipo]}:renombrar`, error)
      return { ok: false, error: mensajeBD(tipo, error) }
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    refrescar()
    return { ok: true, dato: null, mensaje: `Ahora se llama «${v.nombre}».` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:renombrar`, e)
    return { ok: false, error: FALLO }
  }
}

// Archivar (true) o recuperar (false).
export async function archivarOpcion(tipo: TipoOpcion, id: unknown, archivar: boolean): Promise<Respuesta> {
  if (!esTipo(tipo) || !esId(id)) return { ok: false, error: FALLO }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data, error } = await supabase.from(TABLA[tipo]).update({ archivada: Boolean(archivar) }).eq('id', id).eq('user_id', userId).select('nombre')
    if (error) {
      registrarError(`${LOG[tipo]}:archivar`, error)
      return { ok: false, error: FALLO }
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    refrescar()
    return { ok: true, dato: null, mensaje: archivar ? `«${data[0].nombre}» archivada.` : `«${data[0].nombre}» recuperada.` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:archivar`, e)
    return { ok: false, error: FALLO }
  }
}

// Borrar: solo si NO se usa (0 apuestas y, en casas, 0 movimientos). La BD también lo impide.
export async function borrarOpcion(tipo: TipoOpcion, id: unknown): Promise<Respuesta> {
  if (!esTipo(tipo) || !esId(id)) return { ok: false, error: FALLO }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const motivo = motivoNoBorrable(tipo, await usoDe(supabase, userId, tipo, id))
    if (motivo) return { ok: false, error: motivo }
    const { data, error } = await supabase.from(TABLA[tipo]).delete().eq('id', id).eq('user_id', userId).select('nombre')
    if (error) {
      registrarError(`${LOG[tipo]}:borrar`, error)
      return { ok: false, error: mensajeBD(tipo, error) }
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    refrescar()
    return { ok: true, dato: null, mensaje: `«${data[0].nombre}» borrada.` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:borrar`, e)
    return { ok: false, error: FALLO }
  }
}
