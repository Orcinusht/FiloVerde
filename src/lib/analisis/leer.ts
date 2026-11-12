import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo } from '../exportar/csv.ts'
import { ESTADOS_RESUELTOS, enJuego, type ApuestaAnalisis, type Rango, type SeleccionAnalisis } from './calculos.ts'

// Fase 2 · Análisis: lecturas para la pantalla "Análisis". Sin claves: usa el cliente con la
// sesión del usuario que le pasa el servidor (RLS aplica) y, además, filtra por su id, que sale
// de la sesión (nunca del navegador). Lee en tandas de 1000 con orden fijo, como la exportación.
// Solo apuestas resueltas y pendientes del periodo (las anuladas no cuentan en nada).

const COLS =
  'id, fecha, created_at, tipo, estado, importe, divisa, cuota_total, resultado_economico, casa_id, estrategia_id, ' +
  'deporte, en_directo, viendo_partido, precipitada, promo_tipo'

type Fila = Omit<ApuestaAnalisis, 'casa' | 'estrategia' | 'selecciones'> & { casa_id: string | null; estrategia_id: string | null }

// Tamaño de los lotes de ids al pedir las selecciones (la lista va en la dirección de la petición).
const LOTE_IDS = 150

async function nombres(supabase: SupabaseClient, tabla: 'casas_apuestas' | 'estrategias', userId: string) {
  const filas = await leerTodo<{ id: string; nombre: string }>(async (desde, hasta) => {
    const { data, error } = await supabase.from(tabla).select('id, nombre').eq('user_id', userId).order('id').range(desde, hasta)
    if (error) throw error
    return data ?? []
  })
  return new Map(filas.map((f) => [f.id, f.nombre]))
}

// `casa` (opcional, Gráficas): '' = todas, 'sin' = sin casa, o el id de una casa.
// "En juego": TODAS las pendientes del usuario, sin filtro de fechas (solo id e importe).
export async function leerEnJuego(supabase: SupabaseClient, userId: string): Promise<{ n: number; importe: number }> {
  const filas = await leerTodo<{ estado: string; importe: number }>(async (desde, hasta) => {
    const { data, error } = await supabase
      .from('apuestas')
      .select('id, estado, importe')
      .eq('user_id', userId)
      .eq('estado', 'pendiente')
      .order('id')
      .range(desde, hasta)
    if (error) throw error
    return (data ?? []) as never
  })
  return enJuego(filas.map((f) => ({ estado: f.estado, importe: Number(f.importe) })))
}

export async function leerApuestasAnalisis(
  supabase: SupabaseClient,
  userId: string,
  rango: Pick<Rango, 'desde' | 'hasta'>,
  casa = '',
): Promise<ApuestaAnalisis[]> {
  const filas = await leerTodo<Fila>(async (desde, hasta) => {
    let q = supabase
      .from('apuestas')
      .select(COLS)
      .eq('user_id', userId)
      .in('estado', [...ESTADOS_RESUELTOS, 'pendiente'])
    if (rango.desde) q = q.gte('fecha', rango.desde)
    if (rango.hasta) q = q.lt('fecha', rango.hasta)
    if (casa === 'sin') q = q.is('casa_id', null)
    else if (casa) q = q.eq('casa_id', casa)
    const { data, error } = await q.order('fecha').order('created_at').order('id').range(desde, hasta)
    if (error) throw error
    return (data ?? []) as unknown as Fila[]
  })
  if (filas.length === 0) return []

  const [casas, estrategias] = await Promise.all([nombres(supabase, 'casas_apuestas', userId), nombres(supabase, 'estrategias', userId)])

  const porApuesta = new Map<string, SeleccionAnalisis[]>()
  for (let i = 0; i < filas.length; i += LOTE_IDS) {
    const ids = filas.slice(i, i + LOTE_IDS).map((f) => f.id)
    const sel = await leerTodo<SeleccionAnalisis & { apuesta_id: string }>(async (desde, hasta) => {
      const { data, error } = await supabase
        .from('selecciones')
        .select('apuesta_id, deporte, liga, mercado, estado, evento, orden')
        .eq('user_id', userId)
        .in('apuesta_id', ids)
        .order('id')
        .range(desde, hasta)
      if (error) throw error
      return (data ?? []) as unknown as (SeleccionAnalisis & { apuesta_id: string })[]
    })
    for (const { apuesta_id, ...s } of sel) {
      const lista = porApuesta.get(apuesta_id) ?? []
      lista.push(s)
      porApuesta.set(apuesta_id, lista)
    }
  }

  return filas.map(({ casa_id, estrategia_id, ...a }) => ({
    ...a,
    importe: Number(a.importe),
    resultado_economico: a.resultado_economico == null ? null : Number(a.resultado_economico),
    cuota_total: a.cuota_total == null ? null : Number(a.cuota_total),
    casa: casa_id ? (casas.get(casa_id) ?? null) : null,
    casa_id,
    estrategia: estrategia_id ? (estrategias.get(estrategia_id) ?? null) : null,
    // En el orden del resguardo (el primer evento es el que enseña la tarjeta del detalle).
    selecciones: (porApuesta.get(a.id) ?? []).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0)),
  }))
}

// Fecha de tu primera apuesta (cualquier estado; null si no hay): límite de la flecha ‹ del
// balance semanal, para no ir hacia atrás por semanas vacías.
export async function leerPrimeraFecha(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('apuestas').select('fecha').eq('user_id', userId).order('fecha').limit(1)
  if (error) throw error
  return (data?.[0]?.fecha as string | undefined) ?? null
}
