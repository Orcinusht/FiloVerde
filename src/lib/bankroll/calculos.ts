// Fase 3 · Bankroll: cálculos de saldos por casa y global. Funciones PURAS (sin base de datos):
// las usa el servidor y las prueba `npm test`. Importes en céntimos. Saldo y ROI son "hasta hoy"
// (no dependen del filtro de fechas de Análisis).

import { localAIso } from '../apuestas/fechas.ts'

export const TIPOS_MOVIMIENTO = ['deposito', 'retirada', 'ajuste', 'traspaso'] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]
export const esTipoMovimiento = (v: unknown): v is TipoMovimiento => typeof v === 'string' && (TIPOS_MOVIMIENTO as readonly string[]).includes(v)
export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  deposito: 'Depósito',
  retirada: 'Retirada',
  ajuste: 'Ajuste',
  traspaso: 'Traspaso',
}

const RESUELTOS = ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida']
export const SIN_CASA = 'sin'

export type Movimiento = {
  id: string
  fecha: string
  tipo: TipoMovimiento
  importe: number // céntimos; positivo salvo en ajuste (+/−)
  casa_id: string
  casa_destino_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type ApuestaBankroll = {
  casa_id: string | null
  estado: string
  importe: number
  resultado_economico: number | null
}

export type Cifras = {
  saldo: number | null // null en "Sin casa" (no es una cuenta)
  enJuego: number
  disponible: number | null // saldo − en juego
  depositado: number
  retirado: number
  ajustes: number
  traspasosRecibidos: number
  traspasosEnviados: number
  beneficio: number // resultado de las apuestas resueltas (con crédito incluidas)
  roi: number | null // beneficio / depositado; con 0 depositado → null ("—")
  soloTraspasos: boolean // recibe dinero por traspasos pero no tiene depósitos (ROI "—")
  nMovimientos: number
  nResueltas: number
  nPendientes: number
}

const vacias = (): Omit<Cifras, 'saldo' | 'disponible' | 'roi' | 'soloTraspasos'> => ({
  enJuego: 0,
  depositado: 0,
  retirado: 0,
  ajustes: 0,
  traspasosRecibidos: 0,
  traspasosEnviados: 0,
  beneficio: 0,
  nMovimientos: 0,
  nResueltas: 0,
  nPendientes: 0,
})

const dividir = (a: number, b: number) => (b === 0 ? null : a / b)

function terminar(c: ReturnType<typeof vacias>, conSaldo: boolean, conTraspasos = true): Cifras {
  const traspasos = conTraspasos ? c.traspasosRecibidos - c.traspasosEnviados : 0
  const saldo = conSaldo ? c.depositado - c.retirado + c.ajustes + traspasos + c.beneficio : null
  return {
    ...c,
    saldo,
    disponible: saldo == null ? null : saldo - c.enJuego,
    roi: dividir(c.beneficio, c.depositado),
    soloTraspasos: c.depositado === 0 && c.traspasosRecibidos > 0,
  }
}

function sumarApuesta(c: ReturnType<typeof vacias>, a: ApuestaBankroll) {
  if (a.estado === 'pendiente') {
    c.enJuego += Number(a.importe)
    c.nPendientes++
  } else if (RESUELTOS.includes(a.estado) && a.resultado_economico != null) {
    c.beneficio += Number(a.resultado_economico)
    c.nResueltas++
  }
  // anuladas: no suman nada
}

export type Bankroll = {
  global: Cifras
  porCasa: Map<string, Cifras> // casa_id → cifras (todas las casas recibidas, aunque estén a 0)
  sinCasa: Cifras | null // apuestas sin casa (resueltas o pendientes); null si no hay
}

export function calcularBankroll(casas: string[], movimientos: Movimiento[], apuestas: ApuestaBankroll[]): Bankroll {
  const g = vacias()
  const porCasa = new Map<string, ReturnType<typeof vacias>>(casas.map((id) => [id, vacias()]))
  const casa = (id: string) => {
    if (!porCasa.has(id)) porCasa.set(id, vacias())
    return porCasa.get(id)!
  }
  for (const m of movimientos) {
    const imp = Number(m.importe)
    const c = casa(m.casa_id)
    c.nMovimientos++
    g.nMovimientos++
    if (m.tipo === 'deposito') {
      c.depositado += imp
      g.depositado += imp
    } else if (m.tipo === 'retirada') {
      c.retirado += imp
      g.retirado += imp
    } else if (m.tipo === 'ajuste') {
      c.ajustes += imp
      g.ajustes += imp
    } else if (m.tipo === 'traspaso' && m.casa_destino_id) {
      c.traspasosEnviados += imp
      const d = casa(m.casa_destino_id)
      d.traspasosRecibidos += imp
      d.nMovimientos++
      // En el global los traspasos suman cero: no se anotan.
    }
  }
  const sc = vacias()
  for (const a of apuestas) {
    sumarApuesta(g, a)
    sumarApuesta(a.casa_id ? casa(a.casa_id) : sc, a)
  }
  return {
    global: terminar(g, true, false),
    porCasa: new Map([...porCasa].map(([id, c]) => [id, terminar(c, true)])),
    sinCasa: sc.nResueltas + sc.nPendientes > 0 ? terminar(sc, false) : null,
  }
}

// Efecto de un movimiento en el saldo de una casa (para la lista de su detalle).
export function efectoEnCasa(m: Movimiento, casaId: string): number {
  const imp = Number(m.importe)
  if (m.tipo === 'traspaso') return m.casa_destino_id === casaId ? imp : m.casa_id === casaId ? -imp : 0
  if (m.casa_id !== casaId) return 0
  return m.tipo === 'retirada' ? -imp : imp
}
// Efecto en el saldo global (los traspasos, 0).
export const efectoGlobal = (m: Movimiento) => (m.tipo === 'traspaso' ? 0 : m.tipo === 'retirada' ? -Number(m.importe) : Number(m.importe))

// Orden de las listas: más recientes primero (fecha, luego creación, luego id).
export function ordenarMovimientos(lista: Movimiento[]): Movimiento[] {
  return [...lista].sort(
    (a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  )
}

// ---------- Validación del formulario (la repite el servidor; la BD también lo impide) ----------

export type DatosMovimiento = {
  tipo: TipoMovimiento
  fecha: string // ISO
  importe: number // céntimos con signo (solo el ajuste puede ser negativo)
  casa_id: string
  casa_destino_id: string | null
  notas: string | null
}

export type ResultadoValidacion = { ok: true; datos: DatosMovimiento } | { ok: false; errores: Partial<Record<keyof DatosMovimiento, string>> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Día del movimiento → fecha a guardar: hoy → la hora actual; otro día → 12:00 de España; al editar
// sin cambiar el día → la fecha guardada. Días futuros: NO (margen de un día por la zona horaria).
export function fechaDelMovimiento(dia: string, ahora = new Date(), guardada?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(ahora)
  if (guardada && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(guardada)) === dia) return guardada
  if (dia === hoy) return ahora.toISOString()
  const iso = localAIso(`${dia}T12:00`)
  return iso ?? null
}

export const MARGEN_FUTURO_MS = 24 * 3600 * 1000

export function validarMovimiento(
  e: { tipo: unknown; dia: unknown; importe: unknown; signo?: unknown; casa_id: unknown; casa_destino_id?: unknown; notas?: unknown },
  casasPropias: Set<string>,
  ahora = new Date(),
  fechaGuardada?: string | null,
): ResultadoValidacion {
  const errores: Partial<Record<keyof DatosMovimiento, string>> = {}
  const tipo = esTipoMovimiento(e.tipo) ? e.tipo : null
  if (!tipo) errores.tipo = 'Elige el tipo de movimiento.'
  const fecha = typeof e.dia === 'string' ? fechaDelMovimiento(e.dia, ahora, fechaGuardada) : null
  if (!fecha) errores.fecha = 'Indica un día válido.'
  else if (Date.parse(fecha) > ahora.getTime() + MARGEN_FUTURO_MS) errores.fecha = 'La fecha no puede ser futura: registra el movimiento cuando se haga.'
  const abs = typeof e.importe === 'number' && Number.isInteger(e.importe) ? e.importe : NaN
  if (!Number.isFinite(abs) || abs <= 0) errores.importe = 'Escribe un importe mayor que 0.'
  else if (abs > 1_000_000_000) errores.importe = 'El importe es demasiado grande.'
  const casa = typeof e.casa_id === 'string' && UUID.test(e.casa_id) && casasPropias.has(e.casa_id) ? e.casa_id : null
  if (!casa) errores.casa_id = 'Elige una de tus casas.'
  let destino: string | null = null
  if (tipo === 'traspaso') {
    destino = typeof e.casa_destino_id === 'string' && UUID.test(e.casa_destino_id) && casasPropias.has(e.casa_destino_id) ? e.casa_destino_id : null
    if (!destino) errores.casa_destino_id = 'Elige la casa de destino.'
    else if (destino === casa) errores.casa_destino_id = 'La casa de destino debe ser distinta de la de origen.'
  }
  const notas = typeof e.notas === 'string' && e.notas.trim() ? e.notas.trim() : null
  if (notas && notas.length > 500) errores.notas = 'Las notas no pueden pasar de 500 caracteres.'
  if (Object.keys(errores).length) return { ok: false, errores }
  const importe = tipo === 'ajuste' && e.signo === '-' ? -abs : abs
  return { ok: true, datos: { tipo: tipo!, fecha: fecha!, importe, casa_id: casa!, casa_destino_id: destino, notas } }
}
