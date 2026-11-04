import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COLUMNAS_APUESTAS,
  COLUMNAS_SELECCIONES,
  generarCsv,
  leerTodo,
  ordenarSelecciones,
  type ApuestaExportar,
  type SeleccionExportar,
} from './csv.ts'

// Copia de seguridad en CSV: lecturas para /api/exportar/*. Sin claves: usa el cliente con la
// sesión del usuario que le pasa la ruta (RLS aplica) y, además, filtra por su id, que sale de la
// sesión en el servidor (nunca del navegador). Lee en tandas de 1000. Se prueba con un cliente falso.

const COLS_APUESTA =
  'id, fecha, casa_id, estrategia_id, tipo, deporte, importe, divisa, cuota_total, ganancia_potencial, estado, ' +
  'resultado_economico, notas, en_directo, viendo_partido, precipitada, recuperar_perdidas, precipitada_momento, ' +
  'promo_tipo, promo_cuota_original, promo_aumento, promo_base, promo_credito, created_at, updated_at'

const COLS_SELECCION =
  'id, apuesta_id, orden, evento, deporte, liga, mercado, pronostico, cuota, evento_fecha, evento_hora, estado, created_at, updated_at'

type FilaApuesta = Omit<ApuestaExportar, 'casa' | 'estrategia'> & { casa_id: string | null; estrategia_id: string | null }

export type Exportacion = { csv: string; filas: number }

async function nombres(supabase: SupabaseClient, tabla: 'casas_apuestas' | 'estrategias', userId: string) {
  const filas = await leerTodo<{ id: string; nombre: string }>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from(tabla)
      .select('id, nombre')
      .eq('user_id', userId)
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return data ?? []
  })
  return new Map(filas.map((f) => [f.id, f.nombre]))
}

// Apuestas de la más antigua a la más reciente (fecha, luego creación, luego id: orden fijo
// para que las tandas no se salten ni repitan filas).
async function leerApuestas(supabase: SupabaseClient, userId: string): Promise<FilaApuesta[]> {
  return leerTodo<FilaApuesta>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('apuestas')
      .select(COLS_APUESTA)
      .eq('user_id', userId)
      .order('fecha')
      .order('created_at')
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as unknown as FilaApuesta[]
  })
}

export async function exportarApuestas(supabase: SupabaseClient, userId: string): Promise<Exportacion> {
  const filas = await leerApuestas(supabase, userId)
  if (filas.length === 0) return { csv: '', filas: 0 }
  const [casas, estrategias] = await Promise.all([
    nombres(supabase, 'casas_apuestas', userId),
    nombres(supabase, 'estrategias', userId),
  ])
  const apuestas: ApuestaExportar[] = filas.map(({ casa_id, estrategia_id, ...a }) => ({
    ...a,
    casa: casa_id ? (casas.get(casa_id) ?? null) : null,
    estrategia: estrategia_id ? (estrategias.get(estrategia_id) ?? null) : null,
  }))
  return { csv: generarCsv(COLUMNAS_APUESTAS, apuestas), filas: apuestas.length }
}

export async function exportarSelecciones(supabase: SupabaseClient, userId: string): Promise<Exportacion> {
  const apuestas = await leerTodo<{ id: string }>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('apuestas')
      .select('id')
      .eq('user_id', userId)
      .order('fecha')
      .order('created_at')
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return data ?? []
  })
  if (apuestas.length === 0) return { csv: '', filas: 0 }
  const selecciones = await leerTodo<SeleccionExportar>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('selecciones')
      .select(COLS_SELECCION)
      .eq('user_id', userId)
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as unknown as SeleccionExportar[]
  })
  const ordenadas = ordenarSelecciones(selecciones, apuestas.map((a) => a.id))
  return { csv: generarCsv(COLUMNAS_SELECCIONES, ordenadas), filas: ordenadas.length }
}
