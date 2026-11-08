import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo } from '../exportar/csv.ts'
import { agruparConocidos, claveConocida, type DiaConocido, type SeleccionConocida } from './partidos.ts'

// Partidos conocidos: lee las selecciones GUARDADAS del usuario (con la sesión: RLS, y filtrando
// además por su id, que sale de la sesión) en tandas de 1000 con orden fijo, y devuelve lo que se
// sabe de los partidos pedidos (por clave normalizada). Sin claves de administrador.

export const MAX_EVENTOS = 30

export async function leerPartidosConocidos(
  supabase: SupabaseClient,
  userId: string,
  eventos: string[],
): Promise<Record<string, DiaConocido[]>> {
  const claves = new Set(eventos.slice(0, MAX_EVENTOS).map((e) => claveConocida(String(e).slice(0, 200))).filter(Boolean))
  if (claves.size === 0) return {}
  const filas = await leerTodo<{ evento: string | null; evento_fecha: string | null; evento_hora: string | null; liga: string | null; deporte: string | null; created_at: string }>(
    async (desde, hasta) => {
      const { data, error } = await supabase
        .from('selecciones')
        .select('evento, evento_fecha, evento_hora, liga, deporte, created_at')
        .eq('user_id', userId)
        .order('id')
        .range(desde, hasta)
      if (error) throw error
      return (data ?? []) as never
    },
  )
  const utiles: SeleccionConocida[] = filas
    .filter((f) => f.evento_fecha && claves.has(claveConocida(f.evento)))
    .map((f) => ({ evento: f.evento, evento_fecha: f.evento_fecha, evento_hora: f.evento_hora, liga: f.liga, deporte: f.deporte, creada: f.created_at }))
  return Object.fromEntries(agruparConocidos(utiles))
}
