import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo } from '../exportar/csv.ts'
import type { ApuestaBankroll, Movimiento } from './calculos.ts'

// Fase 3 · Bankroll: lecturas. Sin claves: usa el cliente con la sesión del usuario que le pasa el
// servidor (RLS aplica) y, además, filtra por su id, que sale de la sesión (nunca del navegador).
// Todo en tandas de 1000 con orden fijo.

export type Casa = { id: string; nombre: string }

export const COLS_MOVIMIENTO = 'id, fecha, tipo, importe, casa_id, casa_destino_id, notas, created_at, updated_at'

export async function leerCasas(supabase: SupabaseClient, userId: string): Promise<Casa[]> {
  const filas = await leerTodo<Casa>(async (desde, hasta) => {
    const { data, error } = await supabase.from('casas_apuestas').select('id, nombre').eq('user_id', userId).order('id').range(desde, hasta)
    if (error) throw error
    return data ?? []
  })
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Movimientos, de los más recientes a los más antiguos (fecha, creación, id).
export async function leerMovimientos(supabase: SupabaseClient, userId: string): Promise<Movimiento[]> {
  const filas = await leerTodo<Movimiento>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('movimientos_bankroll')
      .select(COLS_MOVIMIENTO)
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as unknown as Movimiento[]
  })
  return filas.map((m) => ({ ...m, importe: Number(m.importe) }))
}

// Apuestas resueltas y pendientes (lo único que mueve el saldo o está en juego).
export async function leerApuestasBankroll(supabase: SupabaseClient, userId: string): Promise<ApuestaBankroll[]> {
  const filas = await leerTodo<ApuestaBankroll & { id: string }>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('apuestas')
      .select('id, casa_id, estado, importe, resultado_economico')
      .eq('user_id', userId)
      .in('estado', ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida', 'pendiente'])
      .order('fecha')
      .order('created_at')
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as unknown as (ApuestaBankroll & { id: string })[]
  })
  return filas.map((a) => ({
    casa_id: a.casa_id,
    estado: a.estado,
    importe: Number(a.importe),
    resultado_economico: a.resultado_economico == null ? null : Number(a.resultado_economico),
  }))
}

export async function leerTodoBankroll(supabase: SupabaseClient, userId: string) {
  const [casas, movimientos, apuestas] = await Promise.all([
    leerCasas(supabase, userId),
    leerMovimientos(supabase, userId),
    leerApuestasBankroll(supabase, userId),
  ])
  return { casas, movimientos, apuestas }
}
