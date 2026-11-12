// Selector de periodo de Análisis (diseño "tipo + navegador", desde el 2026-11-12). Funciones PURAS:
// las usa el servidor y las prueba `npm test`.
//
// Periodos nuevos en la dirección: `periodo=dia|semana|mes|ano` + `ref=AAAA-MM-DD` (el primer día
// del periodo). Las direcciones de antes (`hoy`, `ayer`, `7d`, `mes`, `30d`, `ano`, `todo`,
// `personalizado`) siguen valiendo y dan EXACTAMENTE el mismo rango: se calculan con
// `rangoPeriodo` sin cambios. Todo con los días de España.

import { isoALocal, localAIso } from '../apuestas/fechas.ts'
import { esPeriodo, rangoPeriodo, type Periodo, type Rango } from './calculos.ts'

export const TIPOS_PERIODO = { dia: 'Día', semana: 'Semana', mes: 'Mes', ano: 'Año', todo: 'Todo' } as const
export type TipoPeriodo = keyof typeof TIPOS_PERIODO
type Navegable = Exclude<TipoPeriodo, 'todo'>

export type PeriodoAnalisis = Periodo | 'dia' | 'semana'
export const esPeriodoAnalisis = (v: unknown): v is PeriodoAnalisis => v === 'dia' || v === 'semana' || esPeriodo(v)

export type RangoAnalisis = Omit<Rango, 'periodo'> & {
  periodo: PeriodoAnalisis
  tipo: TipoPeriodo | null // null: atajo de "últimos N días" o rango personalizado
  ref: string // primer día del periodo navegable ('' si no lo es)
}

// Cambios que el selector escribe en la dirección ('' = quitar el parámetro).
export type CambiosPeriodo = { periodo: string; ref: string; desde: string; hasta: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/
export const hoyEnEspana = (ahora = new Date()) => isoALocal(ahora.toISOString()).slice(0, 10)
export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const inicioDia = (dia: string) => localAIso(`${dia}T00:00`) as string
const diaValido = (v: string) => (DIA.test(v) && localAIso(`${v}T00:00`) ? v : '')
// 1 = lunes … 7 = domingo (el día del calendario no depende de la zona horaria).
export function diaSemana(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}
export const lunesDe = (dia: string) => sumarDias(dia, 1 - diaSemana(dia))
const primeroMes = (dia: string) => `${dia.slice(0, 7)}-01`
const primeroAno = (dia: string) => `${dia.slice(0, 4)}-01-01`
function sumarMeses(primero: string, n: number): string {
  const [y, m] = primero.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return t.toISOString().slice(0, 10)
}

// Primer día del periodo que contiene `dia`.
export function inicioPeriodo(tipo: Navegable, dia: string): string {
  return tipo === 'dia' ? dia : tipo === 'semana' ? lunesDe(dia) : tipo === 'mes' ? primeroMes(dia) : primeroAno(dia)
}
// Primer día del periodo anterior (−1) o siguiente (+1).
export function pasoPeriodo(tipo: Navegable, ref: string, n: 1 | -1): string {
  const r = inicioPeriodo(tipo, ref)
  if (tipo === 'dia') return sumarDias(r, n)
  if (tipo === 'semana') return sumarDias(r, 7 * n)
  if (tipo === 'mes') return sumarMeses(r, n)
  return `${Number(r.slice(0, 4)) + n}-01-01`
}

// Rango de Análisis: los periodos de antes, tal cual; los nuevos, con su `ref`.
export function rangoAnalisis(periodo: string, o: { desde?: string; hasta?: string; ref?: string } = {}, ahora = new Date()): RangoAnalisis {
  const hoy = hoyEnEspana(ahora)
  if (!esPeriodoAnalisis(periodo)) periodo = 'todo'
  const p = periodo as PeriodoAnalisis
  const ref = diaValido(o.ref ?? '')
  // "mes" y "ano" SIN ref son "Este mes" y "Este año" (direcciones de antes).
  if ((periodo === 'mes' || periodo === 'ano') && ref && inicioPeriodo(periodo, ref) !== inicioPeriodo(periodo, hoy)) {
    const inicio = inicioPeriodo(periodo, ref)
    if (inicio > hoy) return rangoAnalisis(periodo, {}, ahora) // un periodo futuro no se navega
    const fin = periodo === 'mes' ? sumarMeses(inicio, 1) : `${Number(inicio.slice(0, 4)) + 1}-01-01`
    return { periodo, tipo: periodo, ref: inicio, desde: inicioDia(inicio), hasta: inicioDia(fin), desdeDia: inicio, hastaDia: sumarDias(fin, -1) }
  }
  if (periodo === 'dia' || periodo === 'semana') {
    let inicio = inicioPeriodo(periodo, ref || hoy)
    if (inicio > hoy) inicio = inicioPeriodo(periodo, hoy)
    const largo = periodo === 'dia' ? 1 : 7
    const fin = sumarDias(inicio, largo)
    return { periodo, tipo: periodo, ref: inicio, desde: inicioDia(inicio), hasta: inicioDia(fin), desdeDia: inicio, hastaDia: sumarDias(fin, -1) }
  }
  const r = rangoPeriodo(p as Periodo, o.desde ?? '', o.hasta ?? '', ahora)
  const tipo: TipoPeriodo | null =
    r.periodo === 'hoy' || r.periodo === 'ayer' ? 'dia' : r.periodo === 'mes' ? 'mes' : r.periodo === 'ano' ? 'ano' : r.periodo === 'todo' ? 'todo' : null
  const refViejo = r.periodo === 'mes' || r.periodo === 'ano' ? inicioPeriodo(r.periodo, hoy) : tipo === 'dia' ? r.desdeDia : ''
  return { ...r, tipo, ref: refViejo }
}

// La dirección de un periodo navegable que empieza en `inicio`. Si coincide con un periodo de
// antes (hoy, ayer, este mes, este año) se escribe como antes: direcciones cortas y que también
// entienden Gráficas y Bankroll.
export function cambiosPara(tipo: TipoPeriodo, inicio: string, hoy: string): CambiosPeriodo {
  const vacio = { ref: '', desde: '', hasta: '' }
  if (tipo === 'todo') return { periodo: '', ...vacio }
  if (tipo === 'dia' && inicio === hoy) return { periodo: 'hoy', ...vacio }
  if (tipo === 'dia' && inicio === sumarDias(hoy, -1)) return { periodo: 'ayer', ...vacio }
  if ((tipo === 'mes' || tipo === 'ano') && inicio === inicioPeriodo(tipo, hoy)) return { periodo: tipo, ...vacio }
  return { periodo: tipo, ref: inicio, desde: '', hasta: '' }
}

// ---------- Textos ----------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const DIA_CORTO = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
export const DIA_LARGO = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "9 nov", con el año si no es el de hoy ("29 dic 2025").
export function diaCorto(dia: string, hoy: string, conAno = dia.slice(0, 4) !== hoy.slice(0, 4)): string {
  const t = `${Number(dia.slice(8, 10))} ${MES_CORTO[Number(dia.slice(5, 7)) - 1]}`
  return conAno ? `${t} ${dia.slice(0, 4)}` : t
}
// "Del 9 al 15 nov", "Del 26 oct al 1 nov", "Del 29 dic 2025 al 4 ene 2026".
export function tramo(desde: string, hasta: string, hoy: string): string {
  const otroAno = desde.slice(0, 4) !== hoy.slice(0, 4) || hasta.slice(0, 4) !== hoy.slice(0, 4)
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7)
  const ini = mismoMes ? String(Number(desde.slice(8, 10))) : diaCorto(desde, hoy, otroAno && desde.slice(0, 4) !== hasta.slice(0, 4))
  return `del ${ini} al ${diaCorto(hasta, hoy, otroAno)}`
}
export const fechaLarga = (dia: string, hoy: string) => `${DIA_LARGO[diaSemana(dia)]} ${diaCorto(dia, hoy)}`

export function tituloPeriodo(r: RangoAnalisis, hoy: string): string {
  switch (r.tipo) {
    case 'dia': {
      const etiqueta = `${DIA_CORTO[diaSemana(r.desdeDia)]} ${diaCorto(r.desdeDia, hoy)}`
      if (r.desdeDia === hoy) return `Hoy · ${etiqueta}`
      if (r.desdeDia === sumarDias(hoy, -1)) return `Ayer · ${etiqueta}`
      return mayus(etiqueta)
    }
    case 'semana':
      return `Semana ${tramo(r.desdeDia, r.hastaDia, hoy)}`
    case 'mes': {
      const inicio = r.ref || primeroMes(hoy)
      return `${mayus(MESES[Number(inicio.slice(5, 7)) - 1])} ${inicio.slice(0, 4)}`
    }
    case 'ano':
      return (r.ref || hoy).slice(0, 4)
    case 'todo':
      return 'Todo el historial'
  }
  if (r.periodo === '7d') return `Últimos 7 días (${diaCorto(r.desdeDia, hoy)} – ${diaCorto(r.hastaDia, hoy)})`
  if (r.periodo === '30d') return `Últimos 30 días (${diaCorto(r.desdeDia, hoy)} – ${diaCorto(r.hastaDia, hoy)})`
  // Personalizado
  if (r.desdeDia && r.hastaDia) return r.desdeDia === r.hastaDia ? `El ${fechaLarga(r.desdeDia, hoy).toLowerCase()}` : mayus(tramo(r.desdeDia, r.hastaDia, hoy))
  if (r.desdeDia) return `Desde el ${diaCorto(r.desdeDia, hoy)}`
  if (r.hastaDia) return `Hasta el ${diaCorto(r.hastaDia, hoy)}`
  return 'Rango sin fechas (todo)'
}

// ---------- Navegación ----------

export type NavegacionPeriodo = {
  tipo: TipoPeriodo | null
  titulo: string
  anterior: CambiosPeriodo | null
  siguiente: CambiosPeriodo | null // null si el siguiente empezaría después de hoy
  volver: { texto: string; cambios: CambiosPeriodo } | null // solo si te has alejado del periodo actual
  tipos: Record<TipoPeriodo, CambiosPeriodo> // un toque en Día / Semana / Mes / Año / Todo
  atajos: { clave: string; texto: string; cambios: CambiosPeriodo; activo: boolean }[]
  desdeDia: string
  hastaDia: string
}

const TEXTO_VOLVER: Record<Navegable, string> = { dia: 'Volver a hoy', semana: 'Volver a esta semana', mes: 'Volver a este mes', ano: 'Volver a este año' }

export function navegacionPeriodo(r: RangoAnalisis, hoy: string): NavegacionPeriodo {
  const tipos = Object.fromEntries(
    (Object.keys(TIPOS_PERIODO) as TipoPeriodo[]).map((t) => [t, cambiosPara(t, t === 'todo' ? '' : inicioPeriodo(t, hoy), hoy)]),
  ) as Record<TipoPeriodo, CambiosPeriodo>
  const vacio = { ref: '', desde: '', hasta: '' }
  const atajos = [
    { clave: 'hoy', texto: 'Hoy', cambios: { periodo: 'hoy', ...vacio }, activo: r.tipo === 'dia' && r.desdeDia === hoy },
    { clave: 'ayer', texto: 'Ayer', cambios: { periodo: 'ayer', ...vacio }, activo: r.tipo === 'dia' && r.desdeDia === sumarDias(hoy, -1) },
    { clave: '7d', texto: 'Últimos 7 días', cambios: { periodo: '7d', ...vacio }, activo: r.periodo === '7d' },
    { clave: '30d', texto: 'Últimos 30 días', cambios: { periodo: '30d', ...vacio }, activo: r.periodo === '30d' },
  ]
  let anterior: CambiosPeriodo | null = null
  let siguiente: CambiosPeriodo | null = null
  let volver: NavegacionPeriodo['volver'] = null
  if (r.tipo && r.tipo !== 'todo') {
    const t = r.tipo
    const inicio = inicioPeriodo(t, r.desdeDia)
    anterior = cambiosPara(t, pasoPeriodo(t, inicio, -1), hoy)
    const sig = pasoPeriodo(t, inicio, 1)
    siguiente = sig <= hoy ? cambiosPara(t, sig, hoy) : null
    if (inicio !== inicioPeriodo(t, hoy)) volver = { texto: TEXTO_VOLVER[t], cambios: tipos[t] }
  }
  return { tipo: r.tipo, titulo: tituloPeriodo(r, hoy), anterior, siguiente, volver, tipos, atajos, desdeDia: r.desdeDia, hastaDia: r.hastaDia }
}

// Para volver a Gráficas desde el detalle: los periodos nuevos se escriben como "personalizado"
// con sus días (el selector de Gráficas no conoce "dia" ni "semana" ni el `ref`).
export function periodoParaGraficas(periodo: string, desde: string, hasta: string, ref: string, ahora = new Date()): Record<string, string> {
  const nuevo = periodo === 'dia' || periodo === 'semana' || ((periodo === 'mes' || periodo === 'ano') && ref)
  if (!nuevo) return esPeriodo(periodo) ? { periodo, desde, hasta } : { periodo: '', desde: '', hasta: '' }
  const r = rangoAnalisis(periodo, { ref }, ahora)
  const c = cambiosPara(r.tipo as TipoPeriodo, r.ref, hoyEnEspana(ahora))
  if (!c.ref) return { periodo: c.periodo, desde: '', hasta: '' } // hoy, ayer, este mes o este año
  return { periodo: 'personalizado', desde: r.desdeDia, hasta: r.hastaDia }
}
