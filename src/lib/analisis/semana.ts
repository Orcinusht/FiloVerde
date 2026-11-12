// Balance diario de la semana (Análisis, desde el 2026-11-12). Funciones PURAS: las usa el
// servidor y las prueba `npm test`. NO depende del selector de periodo: tiene su propia semana
// (`?bsem=0` esta semana, `-1` la anterior…). Semana de lunes a domingo, días de España.
//
// Reglas: solo apuestas resueltas con resultado (ganada, perdida, cash out, media ganada, media
// perdida); anuladas y pendientes fuera. El día es el de la FECHA DE LA APUESTA (la fecha de
// resolución no se guarda). Beneficio = suma de `resultado_economico` (las apuestas con crédito
// también suman, como en el beneficio neto de Análisis). El total es la suma de las filas, y cada
// fila guarda los ids de sus apuestas: la lista del detalle sale de aquí y no puede diferir.

import { localAIso } from '../apuestas/fechas.ts'
import { compararFecha, enMadrid, esResuelta, type ApuestaAnalisis } from './calculos.ts'
import { lunesDe, sumarDias, tramo } from './periodo.ts'

export type FilaDia = { dia: string; n: number; beneficio: number; ids: string[] }
export type Semana = {
  bsem: number // 0 = esta semana, -1 = la anterior…
  lunes: string
  domingo: string
  dias: string[] // los que se enseñan: en la semana en curso, solo hasta hoy
  desde: string // ISO: lunes 00:00 de España (incluido)
  hasta: string // ISO: lunes siguiente 00:00 (excluido)
  titulo: string
  tramo: string // "9 – 15 nov" en palabras: "del 9 al 15 nov"
  hayAnterior: boolean // false si la semana anterior es anterior a tu primera apuesta
  haySiguiente: boolean // false en la semana en curso
}

const inicioDia = (dia: string) => localAIso(`${dia}T00:00`) as string
const cuenta = (a: ApuestaAnalisis) => esResuelta(a) && a.resultado_economico != null

// `?bsem=` → número entero ≤ 0 (cualquier otra cosa: esta semana).
export function leerBsem(v: string | undefined): number {
  if (!v || !/^-?\d{1,4}$/.test(v)) return 0
  const n = Number(v)
  return n < 0 ? n : 0
}

// Semanas entre la de tu primera apuesta y esta (0 si no hay apuestas o la primera es de esta
// semana o futura). Es el límite de la flecha ‹.
export function semanasHastaPrimera(hoy: string, primerDia: string | null): number {
  if (!primerDia || primerDia >= hoy) return 0
  const a = Date.parse(`${lunesDe(primerDia)}T00:00:00Z`)
  const b = Date.parse(`${lunesDe(hoy)}T00:00:00Z`)
  return Math.round((b - a) / (7 * 86400000))
}

export function semana(bsem: number, hoy: string, primerDia: string | null): Semana {
  const limite = semanasHastaPrimera(hoy, primerDia)
  const b = Math.max(-limite, Math.min(0, bsem)) || 0 // sin -0
  const lunes = sumarDias(lunesDe(hoy), 7 * b)
  const domingo = sumarDias(lunes, 6)
  const dias: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = sumarDias(lunes, i)
    if (d > hoy) break
    dias.push(d)
  }
  return {
    bsem: b,
    lunes,
    domingo,
    dias,
    desde: inicioDia(lunes),
    hasta: inicioDia(sumarDias(lunes, 7)),
    titulo: b === 0 ? 'Esta semana' : b === -1 ? 'Semana anterior' : `Semana ${tramo(lunes, domingo, hoy)}`,
    tramo: tramo(lunes, domingo, hoy),
    hayAnterior: b > -limite,
    haySiguiente: b < 0,
  }
}

// Una fila: las apuestas resueltas de ESE día (hora de España), en orden de fecha.
export function filaDia(apuestas: ApuestaAnalisis[], dia: string): FilaDia {
  const del = apuestas.filter((a) => cuenta(a) && enMadrid(a.fecha).dia === dia).sort(compararFecha)
  return { dia, n: del.length, beneficio: del.reduce((s, a) => s + (a.resultado_economico ?? 0), 0), ids: del.map((a) => a.id) }
}

export function balanceSemana(apuestas: ApuestaAnalisis[], s: Pick<Semana, 'dias'>): { filas: FilaDia[]; total: { n: number; beneficio: number } } {
  const filas = s.dias.map((d) => filaDia(apuestas, d))
  return { filas, total: { n: filas.reduce((t, f) => t + f.n, 0), beneficio: filas.reduce((t, f) => t + f.beneficio, 0) } }
}

export const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/
export const esDiaValido = (v: string) => DIA_VALIDO.test(v) && localAIso(`${v}T00:00`) != null
// Rango de un día (para leer sus apuestas en el detalle).
export const rangoDia = (dia: string) => ({ desde: inicioDia(dia), hasta: inicioDia(sumarDias(dia, 1)) })
