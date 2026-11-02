import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_NOMBRE_DEPORTE,
  MAX_NOMBRE_LIGA,
  esMixto,
  normalizar,
  type DeporteCat,
  type LigaCat,
} from '@/lib/apuestas/catalogo'
import { registrarError, usuarioActual } from './capturas'

// Crear, renombrar y borrar deportes y ligas del catálogo. Todo se valida aquí.
// Borrar o renombrar NO cambia las apuestas guardadas (guardan el nombre como texto).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.'
const FALLO = 'No se ha podido guardar. Inténtalo de nuevo.'

export type Resultado<T> = { ok: true; item: T; aviso?: string } | { ok: false; error: string }

function limpiar(nombre: unknown, max: number): string | null {
  const t = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
  return t.length >= 1 && t.length <= max ? t : null
}

async function sesion() {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  return { supabase, userId }
}

export async function crearDeporte(nombre: unknown): Promise<Resultado<DeporteCat>> {
  const limpio = limpiar(nombre, MAX_NOMBRE_DEPORTE)
  if (!limpio) return { ok: false, error: `Escribe un nombre (máx. ${MAX_NOMBRE_DEPORTE} letras).` }
  if (esMixto(limpio)) return { ok: false, error: '«Mixto» está reservado para apuestas con varios deportes.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data: todos, error: e1 } = await supabase.from('deportes').select('id, nombre')
    if (e1) throw e1
    const igual = (todos ?? []).find((d) => normalizar(d.nombre) === normalizar(limpio))
    if (igual) {
      return {
        ok: true,
        item: igual,
        aviso: igual.nombre === limpio ? undefined : `Ya tenías «${igual.nombre}»: se usa ese.`,
      }
    }
    const { data, error } = await supabase.from('deportes').insert({ nombre: limpio }).select('id, nombre').single()
    if (error) throw error
    return { ok: true, item: data }
  } catch (e) {
    registrarError('deportes:crear', e)
    return { ok: false, error: FALLO }
  }
}

// La liga se crea dentro de un deporte que ya esté en el catálogo.
export async function crearLiga(deporte: unknown, nombre: unknown): Promise<Resultado<LigaCat>> {
  const limpio = limpiar(nombre, MAX_NOMBRE_LIGA)
  if (!limpio) return { ok: false, error: `Escribe un nombre (máx. ${MAX_NOMBRE_LIGA} letras).` }
  const nombreDeporte = typeof deporte === 'string' ? deporte : ''
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data: deportes, error: e1 } = await supabase.from('deportes').select('id, nombre')
    if (e1) throw e1
    const d = (deportes ?? []).find((x) => normalizar(x.nombre) === normalizar(nombreDeporte))
    if (!d) return { ok: false, error: nombreDeporte ? `Añade antes «${nombreDeporte}» a tus deportes.` : 'Elige antes el deporte.' }
    const { data: ligas, error: e2 } = await supabase.from('ligas').select('id, nombre, deporte_id').eq('deporte_id', d.id)
    if (e2) throw e2
    const igual = (ligas ?? []).find((l) => normalizar(l.nombre) === normalizar(limpio))
    if (igual) {
      return { ok: true, item: igual, aviso: igual.nombre === limpio ? undefined : `Ya tenías «${igual.nombre}»: se usa esa.` }
    }
    const { data, error } = await supabase
      .from('ligas')
      .insert({ deporte_id: d.id, nombre: limpio })
      .select('id, nombre, deporte_id')
      .single()
    if (error) throw error
    return { ok: true, item: data }
  } catch (e) {
    registrarError('ligas:crear', e)
    return { ok: false, error: FALLO }
  }
}

export async function renombrar(tabla: 'deportes' | 'ligas', id: unknown, nombre: unknown): Promise<Resultado<null>> {
  const max = tabla === 'deportes' ? MAX_NOMBRE_DEPORTE : MAX_NOMBRE_LIGA
  const limpio = limpiar(nombre, max)
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'No válido.' }
  if (!limpio) return { ok: false, error: `Escribe un nombre (máx. ${max} letras).` }
  if (tabla === 'deportes' && esMixto(limpio)) return { ok: false, error: '«Mixto» está reservado.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data, error } = await supabase.from(tabla).update({ nombre: limpio }).eq('id', id).select('id')
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'Ya tienes uno con ese nombre (o casi igual).' }
      throw error
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe.' }
    return { ok: true, item: null }
  } catch (e) {
    registrarError(`${tabla}:renombrar`, e)
    return { ok: false, error: FALLO }
  }
}

export async function borrar(tabla: 'deportes' | 'ligas', id: unknown): Promise<Resultado<null>> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'No válido.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) throw error
    return { ok: true, item: null }
  } catch (e) {
    registrarError(`${tabla}:borrar`, e)
    return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
  }
}
