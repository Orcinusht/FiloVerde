// Fase 3 · Evolución en el tiempo: beneficio acumulado, caídas desde máximo, meses y días de la
// semana (Análisis) y curva del saldo (Bankroll). Funciones PURAS (sin base de datos): las usa el
// servidor y las prueba `npm test`. Importes en céntimos. Fechas de España (Europe/Madrid).

import { type ApuestaAnalisis, type FilaSegmento, compararFecha, enMadrid, esResuelta, segmentar } from './calculos.ts'
import { type Movimiento, efectoEnCasa, efectoGlobal } from '../bankroll/calculos.ts'

// Por encima de este número de apuestas, la curva de beneficio pasa a un punto por día.
export const MAX_PUNTOS_POR_APUESTA = 60

const cuenta = (a: ApuestaAnalisis) => esResuelta(a) && a.resultado_economico != null

// ---------- Beneficio acumulado ----------

export type PuntoBeneficio = { fecha: string; dia: string; valor: number; n: number } // n: apuestas del punto

// Un punto por apuesta resuelta (orden: fecha, creación, id), acumulando desde 0. Con más de 60
// apuestas, un punto por día (el valor al final del día). Las de crédito suman (su resultado sí es
// dinero ganado); anuladas y pendientes no cuentan.
export function curvaBeneficio(apuestas: ApuestaAnalisis[]): { puntos: PuntoBeneficio[]; porDia: boolean } {
  const orden = apuestas.filter(cuenta).sort(compararFecha)
  let acumulado = 0
  const puntos: PuntoBeneficio[] = orden.map((a) => {
    acumulado += Number(a.resultado_economico)
    return { fecha: a.fecha, dia: enMadrid(a.fecha).dia, valor: acumulado, n: 1 }
  })
  if (puntos.length <= MAX_PUNTOS_POR_APUESTA) return { puntos, porDia: false }
  const dias: PuntoBeneficio[] = []
  for (const p of puntos) {
    const u = dias[dias.length - 1]
    if (u && u.dia === p.dia) {
      u.valor = p.valor
      u.fecha = p.fecha
      u.n++
    } else dias.push({ ...p })
  }
  return { puntos: dias, porDia: true }
}

// ---------- Caída desde un máximo ----------

export type Caida = {
  importe: number // céntimos, ≥ 0
  desde: string | null // fecha del máximo previo (null: el inicio del periodo, el 0 de partida)
  hasta: string | null // fecha del punto más bajo (null si la caída es 0)
}
export type Caidas = { maxima: Caida; actual: Caida } | null // null: sin apuestas resueltas ("—")

// Apuesta a apuesta (no por día): la curva empieza en 0, que es el primer máximo.
export function caidas(apuestas: ApuestaAnalisis[]): Caidas {
  const orden = apuestas.filter(cuenta).sort(compararFecha)
  if (!orden.length) return null
  let acumulado = 0
  let pico = 0
  let fechaPico: string | null = null
  let maxima: Caida = { importe: 0, desde: null, hasta: null }
  for (const a of orden) {
    acumulado += Number(a.resultado_economico)
    if (acumulado > pico) {
      pico = acumulado
      fechaPico = a.fecha
    } else if (pico - acumulado > maxima.importe) {
      maxima = { importe: pico - acumulado, desde: fechaPico, hasta: a.fecha }
    }
  }
  const actual: Caida = pico - acumulado > 0 ? { importe: pico - acumulado, desde: fechaPico, hasta: orden[orden.length - 1].fecha } : { importe: 0, desde: null, hasta: null }
  return { maxima, actual }
}

// ---------- Por mes y por día de la semana ----------

// Meses: del más reciente al más antiguo. Días: de lunes a domingo. Mismas filas (y mismos ids) que
// usa el detalle con seg=mes / seg=dia.
export const porMes = (apuestas: ApuestaAnalisis[]): FilaSegmento[] => segmentar(apuestas, 'mes').sort((a, b) => (a.clave < b.clave ? 1 : -1))
export const porDiaSemana = (apuestas: ApuestaAnalisis[]): FilaSegmento[] => segmentar(apuestas, 'dia').sort((a, b) => (a.clave < b.clave ? -1 : 1))

// ---------- Curva del saldo (Bankroll) ----------

export type ApuestaSaldo = { id: string; fecha: string; created_at: string; casa_id: string | null; estado: string; resultado_economico: number | null }

export type PuntoSaldo = {
  dia: string // AAAA-MM-DD (hora de España); el primero es el día ANTERIOR al primer día mostrado
  valor: number // saldo al final del día
  depositos: number // depositado ese día (céntimos)
  retiradas: number // retirado ese día (céntimos)
  inicial?: boolean // punto de partida (saldo acumulado antes del periodo)
}

const DIA_MS = 86_400_000
const diaANum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DIA_MS
const numADia = (n: number) => new Date(n * DIA_MS).toISOString().slice(0, 10)
export const sumarDia = (d: string, n: number) => numADia(diaANum(d) + n)
export const indiceDia = diaANum

// casaId null → Global (los traspasos no lo mueven; las apuestas sin casa, solo aquí). Con casa →
// sus movimientos (traspasos incluidos) y sus apuestas. Las apuestas resueltas mueven el saldo el
// día de su fecha; las de fecha futura, hoy (la curva acaba hoy y el último punto es el saldo
// "hasta hoy"). Un punto por día con movimientos o apuestas, más el inicial y el de hoy/fin.
export function curvaSaldo(o: {
  movimientos: Movimiento[]
  apuestas: ApuestaSaldo[]
  casaId: string | null
  desdeDia?: string // '' o ausente: desde el principio
  hastaDia?: string // '' o ausente: hasta hoy
  ahora?: Date
}): PuntoSaldo[] {
  const hoy = enMadrid((o.ahora ?? new Date()).toISOString()).dia
  const fin = o.hastaDia && o.hastaDia < hoy ? o.hastaDia : hoy
  const desde = o.desdeDia || ''
  if (desde && desde > fin) return []
  type Evento = { dia: string; efecto: number; deposito: number; retirada: number }
  const eventos: Evento[] = []
  const diaDe = (iso: string) => {
    const d = enMadrid(iso).dia
    return d > hoy ? hoy : d
  }
  for (const m of o.movimientos) {
    const efecto = o.casaId == null ? efectoGlobal(m) : efectoEnCasa(m, o.casaId)
    const propio = o.casaId == null || m.casa_id === o.casaId
    const deposito = m.tipo === 'deposito' && propio ? Number(m.importe) : 0
    const retirada = m.tipo === 'retirada' && propio ? Number(m.importe) : 0
    if (efecto === 0 && !deposito && !retirada) continue
    eventos.push({ dia: diaDe(m.fecha), efecto, deposito, retirada })
  }
  for (const a of o.apuestas) {
    if (!esResuelta(a) || a.resultado_economico == null) continue
    if (o.casaId != null && a.casa_id !== o.casaId) continue
    eventos.push({ dia: diaDe(a.fecha), efecto: Number(a.resultado_economico), deposito: 0, retirada: 0 })
  }
  let inicial = 0
  const porDia = new Map<string, Evento>()
  for (const e of eventos) {
    if (desde && e.dia < desde) {
      inicial += e.efecto
      continue
    }
    if (e.dia > fin) continue
    const d = porDia.get(e.dia) ?? { dia: e.dia, efecto: 0, deposito: 0, retirada: 0 }
    d.efecto += e.efecto
    d.deposito += e.deposito
    d.retirada += e.retirada
    porDia.set(e.dia, d)
  }
  const dias = [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1))
  const primero = desde || dias[0]?.dia
  if (!primero) return []
  const puntos: PuntoSaldo[] = [{ dia: sumarDia(primero, -1), valor: inicial, depositos: 0, retiradas: 0, inicial: true }]
  let saldo = inicial
  for (const d of dias) {
    saldo += d.efecto
    puntos.push({ dia: d.dia, valor: saldo, depositos: d.deposito, retiradas: d.retirada })
  }
  if (puntos[puntos.length - 1].dia < fin) puntos.push({ dia: fin, valor: saldo, depositos: 0, retiradas: 0 })
  return puntos
}

// "AAAA-MM-DD" → "6 nov 2026" (el día tal cual, sin cambiar de zona).
export const textoDia = (d: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`))
