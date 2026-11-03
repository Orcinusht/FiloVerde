import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esquemaPropuestaIA, propuestaARevisiones, type ApuestaPendiente } from '@/lib/apuestas/propuesta'
import { BUCKET, registrarError } from './capturas'
import { leerCatalogo } from './catalogo'
import { catalogoVacio } from '@/lib/apuestas/catalogo'

// Apuestas que la IA propuso y que aún no se han guardado ni descartado.
// Permite retomar la revisión (sin volver a llamar a la IA) si se cerró la app a mitad.

export type { ApuestaPendiente }

type FilaTranscripcion = {
  id: string
  imagen: string | null
  propuesta: unknown
  descartadas: number[] | null
  n_apuestas: number | null
  created_at: string
}

export async function apuestasPendientes(
  supabase: SupabaseClient,
  filtro: { imagen?: string } = {},
): Promise<ApuestaPendiente[]> {
  let q = supabase
    .from('transcripciones')
    .select('id, imagen, propuesta, descartadas, n_apuestas, created_at')
    .eq('resultado', 'ok')
    .gt('n_apuestas', 0)
    .order('created_at', { ascending: true })
    .limit(50)
  if (filtro.imagen) q = q.eq('imagen', filtro.imagen)
  const { data, error } = await q
  if (error) throw error
  const filas = (data ?? []) as FilaTranscripcion[]
  if (filas.length === 0) return []

  const { data: guardadas, error: e2 } = await supabase
    .from('apuestas')
    .select('transcripcion_id, transcripcion_indice')
    .in(
      'transcripcion_id',
      filas.map((f) => f.id),
    )
  if (e2) throw e2
  const catalogo = await leerCatalogo(supabase).catch(() => catalogoVacio())
  const hechas = new Set((guardadas ?? []).map((g) => `${g.transcripcion_id}:${g.transcripcion_indice}`))

  const pendientes: ApuestaPendiente[] = []
  for (const f of filas) {
    const propuesta = esquemaPropuestaIA.safeParse(f.propuesta)
    if (!propuesta.success) continue
    const revisiones = propuestaARevisiones(propuesta.data, catalogo)
    const descartadas = new Set(f.descartadas ?? [])
    revisiones.forEach((revision, indice) => {
      if (!descartadas.has(indice) && !hechas.has(`${f.id}:${indice}`)) {
        pendientes.push({ transcripcionId: f.id, indice, total: revisiones.length, ruta: f.imagen, revision })
      }
    })
  }
  return pendientes
}

// Borra la captura del bucket SOLO si ya no la usa ninguna apuesta guardada ni
// queda ninguna apuesta de esa captura pendiente de revisar. Las transcripciones
// se conservan (son el registro de coste) y se les vacía el enlace a la imagen.
export async function limpiarImagenSiNoSeUsa(supabase: SupabaseClient, ruta: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('apuestas')
    .select('id', { count: 'exact', head: true })
    .eq('imagen_origen', ruta)
  if (error) throw error
  if ((count ?? 0) > 0) return false

  const pendientes = await apuestasPendientes(supabase, { imagen: ruta })
  if (pendientes.length > 0) return false

  const { error: e2 } = await supabase.storage.from(BUCKET).remove([ruta])
  if (e2) {
    // El enlace en la transcripción se mantiene: así el reintento sabe que falta borrarla.
    registrarError('capturas:borrar', e2)
    return false
  }
  const { error: e3 } = await supabase.from('transcripciones').update({ imagen: null }).eq('imagen', ruta)
  if (e3) registrarError('transcripciones:soltar-imagen', e3)
  return true
}
