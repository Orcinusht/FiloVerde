import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Catalogo } from '@/lib/apuestas/catalogo'

// Lee el catálogo de deportes y ligas del usuario de la sesión (RLS: solo el suyo).
export async function leerCatalogo(supabase: SupabaseClient): Promise<Catalogo> {
  const [d, l] = await Promise.all([
    supabase.from('deportes').select('id, nombre').order('nombre').limit(200),
    supabase.from('ligas').select('id, nombre, deporte_id').order('nombre').limit(2000),
  ])
  if (d.error) throw d.error
  if (l.error) throw l.error
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')
  return { deportes: (d.data ?? []).sort(porNombre), ligas: (l.data ?? []).sort(porNombre) }
}
