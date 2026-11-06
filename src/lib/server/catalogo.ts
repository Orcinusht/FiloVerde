import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Catalogo, DeporteCat, LigaCat } from '@/lib/apuestas/catalogo'
import type { SeleccionCatalogo } from '@/lib/apuestas/catalogo-gestion'
import { leerTodo } from '@/lib/exportar/csv'

// Lee el catálogo de deportes y ligas del usuario de la sesión (RLS: solo el suyo), en tandas de
// 1000 (límite de Supabase por consulta). Incluye las archivadas, marcadas.
export async function leerCatalogo(supabase: SupabaseClient): Promise<Catalogo> {
  const [deportes, ligas] = await Promise.all([
    leerTodo<DeporteCat>(async (desde, hasta) => {
      const { data, error } = await supabase.from('deportes').select('id, nombre, archivada').order('id').range(desde, hasta)
      if (error) throw error
      return data ?? []
    }),
    leerTodo<LigaCat>(async (desde, hasta) => {
      const { data, error } = await supabase.from('ligas').select('id, nombre, deporte_id, archivada').order('id').range(desde, hasta)
      if (error) throw error
      return data ?? []
    }),
  ])
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')
  return { deportes: deportes.sort(porNombre), ligas: ligas.sort(porNombre) }
}

// Selecciones del usuario (solo lo necesario para el uso del catálogo y el detector), en tandas.
export async function leerSeleccionesCatalogo(supabase: SupabaseClient, userId: string): Promise<SeleccionCatalogo[]> {
  return leerTodo<SeleccionCatalogo>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('selecciones')
      .select('id, apuesta_id, deporte, liga, evento, evento_fecha, orden')
      .eq('user_id', userId)
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as SeleccionCatalogo[]
  })
}
