import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { normalizar, type DeporteCat, type LigaCat } from '@/lib/apuestas/catalogo'
import { motivoNoBorrable, validarNombreCatalogo, type TipoCatalogo, type Uso } from '@/lib/apuestas/catalogo-gestion'
import { registrarError, usuarioActual } from './capturas'
import { leerCatalogo } from './catalogo'

// Catálogo de deportes y ligas: crear, renombrar (en el catálogo Y en las apuestas, todo o nada,
// con la función renombrar_en_catalogo de la BD), archivar/recuperar y borrar (solo sin uso).
// Siempre con la sesión del usuario (RLS); el servidor valida y la base de datos lo repite.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.'
const FALLO = 'No se ha podido guardar. Inténtalo de nuevo.'
const TABLA: Record<TipoCatalogo, 'deportes' | 'ligas'> = { deporte: 'deportes', liga: 'ligas' }
const LOG: Record<TipoCatalogo, string> = { deporte: 'deportes', liga: 'ligas' }

export type Resultado<T> = { ok: true; item: T; aviso?: string } | { ok: false; error: string; codigo?: string }

async function sesion() {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  return { supabase, userId }
}

function mensajeBD(tipo: TipoCatalogo, e: { code?: string; hint?: string; message?: string }): { error: string; codigo?: string } {
  if (e.hint === 'cambiado') return { error: 'Los datos han cambiado desde el aviso. Revísalo de nuevo antes de confirmar.', codigo: 'cambiado' }
  if (e.code === '23505') return { error: `Ya tienes ${tipo === 'deporte' ? 'un deporte' : 'una liga en este deporte'} con ese nombre. No se mezclan: elige otro.` }
  if (e.code === '23514') return { error: 'Ese nombre está reservado o no es válido. Elige otro.' }
  if (e.code === '23503' || e.hint === 'en_uso') return { error: tipo === 'deporte' ? 'Este deporte está en uso: no se puede borrar. Puedes renombrarlo o archivarlo.' : 'Esta liga está en uso: no se puede borrar. Puedes renombrarla o archivarla.' }
  if (e.code === 'P0002') return { error: 'Ya no existe. Recarga la página.' }
  return { error: FALLO }
}

// Crear. Si ya existe (también archivado), no se crea otro: se devuelve el existente.
export async function crearDeporte(nombre: unknown): Promise<Resultado<DeporteCat>> {
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const cat = await leerCatalogo(supabase)
    const v = validarNombreCatalogo('deporte', nombre, cat.deportes)
    if (!v.ok) {
      if (v.existente) {
        const e = cat.deportes.find((d) => d.id === v.existente!.id)!
        return { ok: true, item: e, aviso: e.archivada ? `Ya tenías «${e.nombre}» archivado: recupéralo para usarlo.` : `Ya tenías «${e.nombre}»: se usa ese.` }
      }
      return { ok: false, error: v.error }
    }
    const { data, error } = await supabase.from('deportes').insert({ nombre: v.nombre }).select('id, nombre, archivada').single()
    if (error) {
      registrarError('deportes:crear', error)
      return { ok: false, ...mensajeBD('deporte', error) }
    }
    return { ok: true, item: data }
  } catch (e) {
    registrarError('deportes:crear', e)
    return { ok: false, error: FALLO }
  }
}

// La liga se crea dentro de un deporte que ya esté en el catálogo.
export async function crearLiga(deporte: unknown, nombre: unknown): Promise<Resultado<LigaCat>> {
  const nombreDeporte = typeof deporte === 'string' ? deporte : ''
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const cat = await leerCatalogo(supabase)
    const d = cat.deportes.find((x) => normalizar(x.nombre) === normalizar(nombreDeporte))
    if (!d) return { ok: false, error: nombreDeporte ? `Añade antes «${nombreDeporte}» a tus deportes.` : 'Elige antes el deporte.' }
    const hermanas = cat.ligas.filter((l) => l.deporte_id === d.id)
    const v = validarNombreCatalogo('liga', nombre, hermanas)
    if (!v.ok) {
      if (v.existente) {
        const e = hermanas.find((l) => l.id === v.existente!.id)!
        return { ok: true, item: e, aviso: e.archivada ? `Ya tenías «${e.nombre}» archivada: recupérala para usarla.` : `Ya tenías «${e.nombre}»: se usa esa.` }
      }
      return { ok: false, error: v.error }
    }
    const { data, error } = await supabase.from('ligas').insert({ deporte_id: d.id, nombre: v.nombre }).select('id, nombre, deporte_id, archivada').single()
    if (error) {
      registrarError('ligas:crear', error)
      return { ok: false, ...mensajeBD('liga', error) }
    }
    return { ok: true, item: data }
  } catch (e) {
    registrarError('ligas:crear', e)
    return { ok: false, error: FALLO }
  }
}

// Aviso previo: N selecciones en M apuestas (los mismos números que usará renombrar).
export async function previsualizar(tipo: TipoCatalogo, id: unknown): Promise<Resultado<Uso>> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'No válido.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data, error } = await supabase.rpc('previsualizar_renombrado', { p_tipo: tipo, p_id: id })
    if (error) {
      registrarError(`${LOG[tipo]}:previsualizar`, error)
      return { ok: false, ...mensajeBD(tipo, error) }
    }
    const fila = (Array.isArray(data) ? data[0] : data) as { selecciones: number; apuestas: number }
    return { ok: true, item: { selecciones: Number(fila?.selecciones ?? 0), apuestas: Number(fila?.apuestas ?? 0) } }
  } catch (e) {
    registrarError(`${LOG[tipo]}:previsualizar`, e)
    return { ok: false, error: FALLO }
  }
}

// Renombrar en el catálogo y en las selecciones afectadas (todo o nada). `n`/`m`: los números del aviso.
export async function renombrar(tipo: TipoCatalogo, id: unknown, nombre: unknown, n: unknown, m: unknown): Promise<Resultado<Uso>> {
  if (typeof id !== 'string' || !UUID.test(id) || !Number.isInteger(n) || !Number.isInteger(m)) return { ok: false, error: 'No válido.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const cat = await leerCatalogo(supabase)
    const item = tipo === 'deporte' ? cat.deportes.find((d) => d.id === id) : cat.ligas.find((l) => l.id === id)
    if (!item) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    const hermanos = tipo === 'deporte' ? cat.deportes : cat.ligas.filter((l) => l.deporte_id === (item as LigaCat).deporte_id)
    const v = validarNombreCatalogo(tipo, nombre, hermanos, id)
    if (!v.ok) return { ok: false, error: v.error }
    const { data, error } = await supabase.rpc('renombrar_en_catalogo', { p_tipo: tipo, p_id: id, p_nombre: v.nombre, p_selecciones: n, p_apuestas: m })
    if (error) {
      registrarError(`${LOG[tipo]}:renombrar`, error)
      return { ok: false, ...mensajeBD(tipo, error) }
    }
    const fila = (Array.isArray(data) ? data[0] : data) as { selecciones: number; apuestas: number }
    return { ok: true, item: { selecciones: Number(fila?.selecciones ?? 0), apuestas: Number(fila?.apuestas ?? 0) } }
  } catch (e) {
    registrarError(`${LOG[tipo]}:renombrar`, e)
    return { ok: false, error: FALLO }
  }
}

export async function archivar(tipo: TipoCatalogo, id: unknown, archivada: boolean): Promise<Resultado<null>> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'No válido.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data, error } = await supabase.from(TABLA[tipo]).update({ archivada: Boolean(archivada) }).eq('id', id).eq('user_id', userId).select('nombre')
    if (error) {
      registrarError(`${LOG[tipo]}:archivar`, error)
      return { ok: false, error: FALLO }
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    return { ok: true, item: null, aviso: archivada ? `«${data[0].nombre}» archivad${tipo === 'deporte' ? 'o' : 'a'}.` : `«${data[0].nombre}» recuperad${tipo === 'deporte' ? 'o' : 'a'}.` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:archivar`, e)
    return { ok: false, error: FALLO }
  }
}

// Recuperar desde la revisión de una captura (el desplegable solo conoce el nombre).
export async function recuperarPorNombre(tipo: TipoCatalogo, nombre: unknown, deporte?: unknown): Promise<Resultado<null>> {
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const cat = await leerCatalogo(supabase)
    let id: string | undefined
    if (tipo === 'deporte') id = cat.deportes.find((d) => normalizar(d.nombre) === normalizar(String(nombre ?? '')))?.id
    else {
      const d = cat.deportes.find((x) => normalizar(x.nombre) === normalizar(String(deporte ?? '')))
      id = d && cat.ligas.find((l) => l.deporte_id === d.id && normalizar(l.nombre) === normalizar(String(nombre ?? '')))?.id
    }
    if (!id) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    return archivar(tipo, id, false)
  } catch (e) {
    registrarError(`${LOG[tipo]}:recuperar`, e)
    return { ok: false, error: FALLO }
  }
}

// Borrar: solo sin uso (0 selecciones). Borrar un deporte borra sus ligas (que tampoco se usan).
export async function borrar(tipo: TipoCatalogo, id: unknown): Promise<Resultado<null>> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'No válido.' }
  try {
    const { supabase, userId } = await sesion()
    if (!userId) return { ok: false, error: SIN_SESION }
    const u = await previsualizar(tipo, id)
    if (!u.ok) return u
    const motivo = motivoNoBorrable(tipo, u.item)
    if (motivo) return { ok: false, error: motivo }
    const { data, error } = await supabase.from(TABLA[tipo]).delete().eq('id', id).eq('user_id', userId).select('nombre')
    if (error) {
      registrarError(`${LOG[tipo]}:borrar`, error)
      return { ok: false, ...mensajeBD(tipo, error) }
    }
    if (!data?.length) return { ok: false, error: 'Ya no existe. Recarga la página.' }
    return { ok: true, item: null, aviso: `«${data[0].nombre}» borrad${tipo === 'deporte' ? 'o' : 'a'} del catálogo.` }
  } catch (e) {
    registrarError(`${LOG[tipo]}:borrar`, e)
    return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
  }
}
