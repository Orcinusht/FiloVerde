// Fase 3 · Pestaña Gráficas: filtro de casa, curva de beneficio acumulado y una serie por cada
// valor de un segmento. Funciones PURAS (sin base de datos): las usa el servidor y las prueba
// `npm test`. Reutilizan las reglas de Análisis y Evolución: una serie = las apuestas de una fila de
// `segmentar` (los MISMOS ids), así que su beneficio final es el de esa fila.

import { localAIso, formatoFecha } from '../apuestas/fechas.ts'
import { formatoImporte } from '../apuestas/dinero.ts'
import {
  MUESTRA_MINIMA,
  compararFecha,
  enMadrid,
  esResuelta,
  segmentar,
  type ApuestaAnalisis,
  type Segmento,
} from '../analisis/calculos.ts'
import { caidas, curvaBeneficio, textoDia } from '../analisis/evolucion.ts'
import { tonoDe, type Tono } from './geometria.ts'

// ---------- Filtro de casa ----------

export const CASA_SIN = 'sin' // "Sin casa": apuestas sin casa asignada
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Valor de ?casa= válido: '' (todas), 'sin' o un id con forma de uuid. Lo demás → '' (todas).
export const leerCasa = (v: unknown): string => (typeof v === 'string' && (v === CASA_SIN || UUID.test(v)) ? v.toLowerCase() : '')

// '' = todas; 'sin' = solo las que no tienen casa; un id = solo las de esa casa.
export function filtrarCasa<T extends { casa_id?: string | null }>(apuestas: T[], casa: string): T[] {
  if (!casa) return apuestas
  if (casa === CASA_SIN) return apuestas.filter((a) => !a.casa_id)
  return apuestas.filter((a) => a.casa_id === casa)
}

// ---------- Series ----------

export const SERIES_POR_TANDA = 8

// Cuántas series se enseñan con ?mas=: de 8 en 8, nunca menos de 8 ni más de las que hay.
export function seriesVisibles(total: number, mas: unknown): number {
  const pedido = Number.parseInt(String(mas ?? ''), 10)
  const n = Number.isFinite(pedido) && pedido > SERIES_POR_TANDA ? Math.ceil(pedido / SERIES_POR_TANDA) * SERIES_POR_TANDA : SERIES_POR_TANDA
  return Math.min(total, n)
}

export type PuntoSerie = { x: number; y: number; texto: string }

export type Curva = {
  puntos: PuntoSerie[] // el primero es el 0 de partida, en el inicio del eje
  porDia: boolean
  final: number // beneficio acumulado al final (céntimos)
  tono: Tono
  caidaMaxima: number | null // null sin apuestas
  caidaActual: number | null
  desdeMaxima: string | null
  hastaMaxima: string | null
  desdeActual: string | null
  hastaActual: string | null
}

const cuenta = (a: ApuestaAnalisis) => esResuelta(a) && a.resultado_economico != null

// Eje de fechas común: desde las 00:00 (España) del día de la primera apuesta resuelta hasta la
// última. null si no hay ninguna.
export function dominioFechas(apuestas: ApuestaAnalisis[]): [number, number] | null {
  const r = apuestas.filter(cuenta).sort(compararFecha)
  if (!r.length) return null
  const inicio = Date.parse(localAIso(`${enMadrid(r[0].fecha).dia}T00:00`) as string)
  const fin = Date.parse(r[r.length - 1].fecha)
  return [inicio, Math.max(fin, inicio + 1)]
}

const eur = (c: number, signo = false) => formatoImporte(c, 'EUR', { conSigno: signo })

// Curva de beneficio acumulado para la gráfica: cada punto en su fecha (x = milisegundos). Un punto
// por apuesta (etiqueta con fecha y HORA y "apuesta k de N") o, con más de 60, por día. Empieza en
// 0 en el inicio del eje.
export function curvaGrafica(apuestas: ApuestaAnalisis[], inicioEje: number): Curva {
  const { puntos, porDia } = curvaBeneficio(apuestas)
  const c = caidas(apuestas)
  const total = puntos.length
  const final = total ? puntos[total - 1].valor : 0
  const serie: PuntoSerie[] = [{ x: inicioEje, y: 0, texto: 'Inicio\nAcumulado: 0,00 €' }]
  puntos.forEach((p, i) => {
    serie.push({
      x: Date.parse(p.fecha),
      y: p.valor,
      texto: porDia
        ? `${textoDia(p.dia)} · ${p.n} ${p.n === 1 ? 'apuesta' : 'apuestas'}\nAcumulado: ${eur(p.valor, true)}`
        : `${formatoFecha(p.fecha)} · apuesta ${i + 1} de ${total}\nAcumulado: ${eur(p.valor, true)}`,
    })
  })
  return {
    puntos: serie,
    porDia,
    final,
    tono: tonoDe(final),
    caidaMaxima: c ? c.maxima.importe : null,
    caidaActual: c ? c.actual.importe : null,
    desdeMaxima: c?.maxima.desde ?? null,
    hastaMaxima: c?.maxima.hasta ?? null,
    desdeActual: c?.actual.desde ?? null,
    hastaActual: c?.actual.hasta ?? null,
  }
}

export type Serie = {
  clave: string
  etiqueta: string
  n: number
  beneficio: number
  yield: number | null
  muestraPequena: boolean
  ids: string[]
  curva: Curva
}

export type OrdenSeries = 'n' | 'beneficio'

// Una serie por cada valor del segmento (con "Varios", "Sin dato", "Sin casa"… como cualquier otro).
// Orden: más apuestas primero (o por beneficio). Solo se construye la curva de las `hasta` primeras.
export function seriesPorSegmento(
  apuestas: ApuestaAnalisis[],
  seg: Segmento,
  orden: OrdenSeries,
  inicioEje: number,
  hasta = Infinity,
): { series: Serie[]; total: number } {
  const filas = segmentar(apuestas, seg, orden)
  const porId = new Map(apuestas.map((a) => [a.id, a]))
  const series = filas.slice(0, hasta).map((f) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    n: f.n,
    beneficio: f.beneficio,
    yield: f.yield,
    muestraPequena: f.n < MUESTRA_MINIMA,
    ids: f.ids,
    curva: curvaGrafica(
      f.ids.map((id) => porId.get(id)!),
      inicioEje,
    ),
  }))
  return { series, total: filas.length }
}

// Escala común de euros para "Misma escala": del mínimo al máximo de todas las series (con el 0).
export function escalaComun(curvas: Curva[]): [number, number] {
  let min = 0
  let max = 0
  for (const c of curvas) for (const p of c.puntos) {
    if (p.y < min) min = p.y
    if (p.y > max) max = p.y
  }
  return [min, max]
}
