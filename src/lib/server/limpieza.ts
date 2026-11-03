import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET, registrarError } from './capturas'
import { apuestasPendientes } from './pendientes'

// Las capturas son TEMPORALES: solo sirven para revisar. Al guardar (o descartar) la última
// apuesta de una captura, la imagen se borra. Aquí está:
//  · el reintento silencioso de los borrados que fallaron, y
//  · el recuento y borrado (desde Ajustes, con confirmación) de las capturas antiguas.
// Todo con la sesión del usuario: Storage solo deja ver y borrar su propia carpeta.
// NUNCA se toca una captura con apuestas pendientes de revisar.

// Margen antes de dar por "olvidada" una imagen: protege una captura que se está
// subiendo o revisando ahora mismo. En pruebas locales se pone a 0.
function margenMs() {
  const min = Number(process.env.FILOVERDE_MARGEN_CAPTURAS_MIN ?? 120)
  return (Number.isFinite(min) && min >= 0 ? min : 120) * 60_000
}

type Archivo = { ruta: string; bytes: number; creado: string | null }

export type ClasificacionCapturas = {
  pendientes: Archivo[] // de apuestas leídas sin revisar → nunca se borran
  guardadas: Archivo[] // enlazadas a apuestas guardadas o a lecturas ya cerradas → se pueden borrar
  sinEnlace: Archivo[] // en Storage pero la base de datos no las enlaza (antiguas) → se pueden borrar
  recientes: Archivo[] // sin enlace pero recién subidas (puede que se estén revisando) → no se tocan
}

async function listarCarpeta(supabase: SupabaseClient, userId: string): Promise<Archivo[]> {
  const todos: Archivo[] = []
  for (let offset = 0; offset < 10_000; offset += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100, offset })
    if (error) throw error
    for (const f of data ?? []) {
      if (!f.name || f.id === null) continue // subcarpetas
      todos.push({ ruta: `${userId}/${f.name}`, bytes: Number(f.metadata?.size ?? 0), creado: f.created_at ?? null })
    }
    if (!data || data.length < 100) break
  }
  return todos
}

// Rutas que la base de datos enlaza, y las protegidas por estar pendientes de revisar.
async function enlaces(supabase: SupabaseClient) {
  const [ap, tr, pend] = await Promise.all([
    supabase.from('apuestas').select('imagen_origen').not('imagen_origen', 'is', null).limit(5000),
    supabase.from('transcripciones').select('imagen, created_at').not('imagen', 'is', null).limit(5000),
    apuestasPendientes(supabase),
  ])
  if (ap.error) throw ap.error
  if (tr.error) throw tr.error
  return {
    deApuestas: new Set((ap.data ?? []).map((a) => a.imagen_origen as string)),
    deLecturas: new Map((tr.data ?? []).map((t) => [t.imagen as string, t.created_at as string])),
    pendientes: new Set(pend.map((p) => p.ruta).filter((r): r is string => !!r)),
  }
}

export async function clasificarCapturas(supabase: SupabaseClient, userId: string): Promise<ClasificacionCapturas> {
  const [archivos, e] = await Promise.all([listarCarpeta(supabase, userId), enlaces(supabase)])
  const limite = Date.now() - margenMs()
  const c: ClasificacionCapturas = { pendientes: [], guardadas: [], sinEnlace: [], recientes: [] }
  for (const a of archivos) {
    if (e.pendientes.has(a.ruta)) c.pendientes.push(a)
    else if (e.deApuestas.has(a.ruta) || e.deLecturas.has(a.ruta)) c.guardadas.push(a)
    else if (a.creado && new Date(a.creado).getTime() > limite) c.recientes.push(a)
    else c.sinEnlace.push(a)
  }
  return c
}

async function borrarRutas(supabase: SupabaseClient, rutas: string[]): Promise<string[]> {
  const borradas: string[] = []
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100)
    const { error } = await supabase.storage.from(BUCKET).remove(lote)
    if (error) {
      registrarError('capturas:borrar-lote', error)
      continue
    }
    // Sin error = borradas (o ya no existían): en los dos casos ya no hay nada que borrar.
    borradas.push(...lote)
  }
  return borradas
}

async function soltarEnlaces(supabase: SupabaseClient, rutas: string[]) {
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100)
    const [a, t] = await Promise.all([
      supabase.from('apuestas').update({ imagen_origen: null }).in('imagen_origen', lote),
      supabase.from('transcripciones').update({ imagen: null }).in('imagen', lote),
    ])
    if (a.error) registrarError('apuestas:soltar-imagen', a.error)
    if (t.error) registrarError('transcripciones:soltar-imagen', t.error)
  }
}

// Ajustes → "Borrar": borra las guardadas y las sin enlace. Se recalcula aquí (no se fía
// del navegador) y nunca incluye las pendientes de revisar ni las recién subidas.
export async function borrarCapturasAntiguas(supabase: SupabaseClient, userId: string) {
  const c = await clasificarCapturas(supabase, userId)
  const rutas = [...c.guardadas, ...c.sinEnlace].map((a) => a.ruta)
  const borradas = await borrarRutas(supabase, rutas)
  await soltarEnlaces(supabase, borradas)
  return { borradas: borradas.length, intentadas: rutas.length, protegidas: c.pendientes.length + c.recientes.length }
}

// Reintento silencioso: imágenes cuya lectura ya está cerrada (todas sus apuestas guardadas o
// descartadas) pero que siguen enlazadas porque su borrado falló. NO toca:
//  · capturas con apuestas pendientes de revisar,
//  · imágenes de apuestas antiguas (eso solo se borra desde Ajustes, con tu OK),
//  · lecturas recientes (pueden estar revisándose ahora).
export async function reintentarBorrados(supabase: SupabaseClient): Promise<number> {
  const e = await enlaces(supabase)
  const limite = Date.now() - margenMs()
  const rutas = [...e.deLecturas.entries()]
    .filter(([ruta, creado]) => !e.pendientes.has(ruta) && !e.deApuestas.has(ruta) && new Date(creado).getTime() <= limite)
    .map(([ruta]) => ruta)
    .slice(0, 20)
  if (rutas.length === 0) return 0
  const borradas = await borrarRutas(supabase, rutas)
  await soltarEnlaces(supabase, borradas)
  return borradas.length
}
