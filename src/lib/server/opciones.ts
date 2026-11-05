import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo } from '@/lib/exportar/csv'
import { contarUso, type OpcionGestion, type TipoOpcion, type Uso } from '@/lib/apuestas/opciones'

// Lecturas de casas y estrategias para Ajustes (con la sesión del usuario; en tandas de 1000).
const TABLA: Record<TipoOpcion, 'casas_apuestas' | 'estrategias'> = { casa: 'casas_apuestas', estrategia: 'estrategias' }

export async function leerOpciones(supabase: SupabaseClient, userId: string, tipo: TipoOpcion): Promise<OpcionGestion[]> {
  const filas = await leerTodo<OpcionGestion>(async (desde, hasta) => {
    const { data, error } = await supabase.from(TABLA[tipo]).select('id, nombre, archivada').eq('user_id', userId).order('id').range(desde, hasta)
    if (error) throw error
    return (data ?? []) as OpcionGestion[]
  })
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Uso de todas (para la lista de Ajustes). Lee en tandas de 1000.
export async function usoDeTodas(supabase: SupabaseClient, userId: string, tipo: TipoOpcion): Promise<Map<string, Uso>> {
  const apuestas = await leerTodo<{ casa_id: string | null; estrategia_id: string | null }>(async (desde, hasta) => {
    const { data, error } = await supabase.from('apuestas').select('casa_id, estrategia_id').eq('user_id', userId).order('id').range(desde, hasta)
    if (error) throw error
    return data ?? []
  })
  const movimientos =
    tipo === 'casa'
      ? await leerTodo<{ casa_id: string; casa_destino_id: string | null }>(async (desde, hasta) => {
          const { data, error } = await supabase.from('movimientos_bankroll').select('casa_id, casa_destino_id').eq('user_id', userId).order('id').range(desde, hasta)
          if (error) throw error
          return data ?? []
        })
      : []
  return contarUso(tipo, apuestas, movimientos)
}

