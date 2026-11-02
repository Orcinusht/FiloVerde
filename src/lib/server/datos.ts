import 'server-only'
import { connection } from 'next/server'
import { createClient as crearClienteSupabase } from '@/lib/supabase/server'
import { apuestasPendientes, type ApuestaPendiente } from './pendientes'
import type { EstadoApuesta, EstadoSeleccion, TipoApuesta } from '@/lib/apuestas/estados'

// Lecturas de la base de datos (siempre con la sesión del usuario: RLS aplica).

import type { Opcion } from '@/lib/apuestas/formulario'
export type { Opcion }

export type FilaApuesta = {
  id: string
  fecha: string
  tipo: TipoApuesta
  importe: number
  divisa: string
  cuota_total: number | null
  estado: EstadoApuesta
  resultado_economico: number | null
  casa: string | null
  n_selecciones: number
  primer_evento: string | null
}

export type DetalleApuesta = {
  id: string
  casa_id: string | null
  estrategia_id: string | null
  tipo: TipoApuesta
  fecha: string
  importe: number
  divisa: string
  cuota_total: number | null
  ganancia_potencial: number | null
  estado: EstadoApuesta
  resultado_economico: number | null
  notas: string | null
  imagen_origen: string | null
  selecciones: {
    evento: string | null
    liga: string | null
    deporte: string | null
    mercado: string | null
    pronostico: string | null
    cuota: number | null
    estado: EstadoSeleccion
    evento_fecha: string | null
    evento_hora: string | null
  }[]
}

// Estas lecturas son siempre del momento (datos del usuario): nunca se prerenderizan.
async function createClient() {
  await connection()
  return crearClienteSupabase()
}

const num = (v: unknown) => (v == null ? null : Number(v))

export async function listarCasas(): Promise<Opcion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('casas_apuestas').select('id, nombre').order('nombre')
  if (error) throw error
  return data ?? []
}

export async function listarEstrategias(): Promise<Opcion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('estrategias').select('id, nombre').order('nombre')
  if (error) throw error
  return data ?? []
}

export const POR_PAGINA = 50

export async function listarApuestas(filtros: { estado?: string; casa?: string; pagina?: number }) {
  const supabase = await createClient()
  const pagina = Math.max(0, filtros.pagina ?? 0)
  let q = supabase
    .from('apuestas')
    .select(
      'id, fecha, tipo, importe, divisa, cuota_total, estado, resultado_economico, casas_apuestas(nombre), selecciones(evento, pronostico, orden)',
      { count: 'exact' },
    )
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
  if (filtros.estado) q = q.eq('estado', filtros.estado)
  if (filtros.casa === 'sin') q = q.is('casa_id', null)
  else if (filtros.casa) q = q.eq('casa_id', filtros.casa)

  const { data, error, count } = await q
  if (error) throw error
  const filas: FilaApuesta[] = (data ?? []).map((a) => {
    const casa = a.casas_apuestas as unknown as { nombre: string } | null
    const sels = ((a.selecciones ?? []) as { evento: string | null; pronostico: string | null; orden: number }[]).sort(
      (x, y) => x.orden - y.orden,
    )
    return {
      id: a.id,
      fecha: a.fecha,
      tipo: a.tipo,
      importe: Number(a.importe),
      divisa: a.divisa,
      cuota_total: num(a.cuota_total),
      estado: a.estado,
      resultado_economico: num(a.resultado_economico),
      casa: casa?.nombre ?? null,
      n_selecciones: sels.length,
      primer_evento: sels[0]?.evento ?? sels[0]?.pronostico ?? null,
    }
  })
  return { filas, total: count ?? filas.length }
}

export async function obtenerApuesta(id: string): Promise<DetalleApuesta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('apuestas')
    .select(
      'id, casa_id, estrategia_id, tipo, fecha, importe, divisa, cuota_total, ganancia_potencial, estado, resultado_economico, notas, imagen_origen, selecciones(evento, liga, deporte, mercado, pronostico, cuota, estado, evento_fecha, evento_hora, orden)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const sels = [...((data.selecciones ?? []) as (DetalleApuesta['selecciones'][number] & { orden: number })[])].sort(
    (x, y) => x.orden - y.orden,
  )
  return {
    ...data,
    importe: Number(data.importe),
    cuota_total: num(data.cuota_total),
    ganancia_potencial: num(data.ganancia_potencial),
    resultado_economico: num(data.resultado_economico),
    selecciones: sels.map((s) => ({ ...s, cuota: num(s.cuota) })),
  } as DetalleApuesta
}

export type ResumenCosteIA = {
  totalLecturas: number
  totalUsd: number
  mesLecturas: number
  mesUsd: number
  medioUsd: number | null
  fallidas: number
  modelos: string[]
}

export async function resumenCosteIA(): Promise<ResumenCosteIA> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transcripciones')
    .select('modelo, resultado, coste_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  const filas = data ?? []
  const ahora = new Date()
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()
  const coste = (f: { coste_usd: unknown }) => Number(f.coste_usd ?? 0)
  const delMes = filas.filter((f) => f.created_at >= inicioMes)
  const conCoste = filas.filter((f) => f.coste_usd != null)
  const totalUsd = filas.reduce((s, f) => s + coste(f), 0)
  return {
    totalLecturas: filas.length,
    totalUsd,
    mesLecturas: delMes.length,
    mesUsd: delMes.reduce((s, f) => s + coste(f), 0),
    medioUsd: conCoste.length ? conCoste.reduce((s, f) => s + coste(f), 0) / conCoste.length : null,
    fallidas: filas.filter((f) => f.resultado === 'error').length,
    modelos: [...new Set(filas.slice(0, 50).map((f) => f.modelo))],
  }
}

// Apuestas leídas por la IA que quedaron sin revisar (p. ej. se cerró la app a mitad).
export async function listarPendientes(): Promise<ApuestaPendiente[]> {
  const supabase = await createClient()
  return apuestasPendientes(supabase)
}
