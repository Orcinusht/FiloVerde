// Fase 2 · Análisis: cálculos de la pantalla "Análisis". Funciones PURAS (sin base de datos):
// las usa el servidor y las prueba `npm test`. Importes en céntimos. La app registra y analiza:
// aquí no hay recomendaciones ni pronósticos.

import { normalizar } from '../apuestas/catalogo.ts'
import { NOMBRE_TIPO, type TipoApuesta } from '../apuestas/estados.ts'
import { isoALocal, localAIso } from '../apuestas/fechas.ts'

// Por debajo de este número, una fila lleva la etiqueta "Muestra pequeña". ÚNICO sitio donde se define.
export const MUESTRA_MINIMA = 10

export const ESTADOS_RESUELTOS = ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida'] as const
export const SIN_DATO = 'Sin dato'
export const VARIOS = 'Varios'

export type SeleccionAnalisis = {
  deporte: string | null
  liga: string | null
  mercado: string | null
  estado: string
  evento?: string | null // solo para la tarjeta del detalle
  orden?: number
}

export type ApuestaAnalisis = {
  id: string
  fecha: string
  created_at: string
  tipo: string
  estado: string
  importe: number
  divisa: string
  cuota_total: number | null
  resultado_economico: number | null
  casa: string | null
  casa_id?: string | null // para el filtro de casa de Gráficas (Análisis no lo usa)
  estrategia: string | null
  deporte: string | null
  en_directo: boolean
  viendo_partido: boolean
  precipitada: boolean
  promo_tipo: string | null
  selecciones: SeleccionAnalisis[]
}

export const esResuelta = (a: Pick<ApuestaAnalisis, 'estado'>) => (ESTADOS_RESUELTOS as readonly string[]).includes(a.estado)
// Apuesta pagada con crédito de promoción: su importe no es dinero propio.
export const esCredito = (a: Pick<ApuestaAnalisis, 'promo_tipo'>) => a.promo_tipo === 'credito'

// Resueltas que cuentan: estado resuelto Y con resultado económico (las que no lo tienen se
// avisan aparte; hoy no debería haber ninguna).
const cuenta = (a: ApuestaAnalisis) => esResuelta(a) && a.resultado_economico != null
const num = (v: unknown) => Number(v)

// División segura: con denominador 0 → null (en pantalla, "—").
export const dividir = (a: number, b: number): number | null => (b === 0 ? null : a / b)

// ---------- Métricas ----------

export type Metricas = {
  n: number // apuestas resueltas (incluidas las de crédito)
  importe: number // importe apostado (SIN las de crédito: no es dinero propio)
  beneficio: number // suma del resultado económico (CON las de crédito)
  yield: number | null // beneficio sin crédito / importe sin crédito
  acierto: number | null // > 0 / (> 0 + < 0), sin crédito; el resultado 0 no entra
  ganadas: number
  perdidas: number
  nCredito: number
  beneficioCredito: number
}

export function metricas(apuestas: ApuestaAnalisis[]): Metricas {
  const m: Metricas = { n: 0, importe: 0, beneficio: 0, yield: null, acierto: null, ganadas: 0, perdidas: 0, nCredito: 0, beneficioCredito: 0 }
  let beneficioPropio = 0
  for (const a of apuestas) {
    if (!cuenta(a)) continue
    const r = num(a.resultado_economico)
    m.n++
    m.beneficio += r
    if (esCredito(a)) {
      m.nCredito++
      m.beneficioCredito += r
      continue
    }
    m.importe += num(a.importe)
    beneficioPropio += r
    if (r > 0) m.ganadas++
    else if (r < 0) m.perdidas++
  }
  m.yield = dividir(beneficioPropio, m.importe)
  m.acierto = dividir(m.ganadas, m.ganadas + m.perdidas)
  return m
}

// ---------- Rachas ----------

export type Racha = { signo: 'ganadas' | 'perdidas'; n: number } | null
export type Rachas = { actual: Racha; mejor: number; peor: number }

// Ordenadas por fecha (desempate: creación, id). > 0 suma a la ganadora, < 0 a la perdedora;
// resultado 0 y anuladas ni rompen ni suman. Solo con las apuestas recibidas (las del periodo).
export function rachas(apuestas: ApuestaAnalisis[]): Rachas {
  const orden = apuestas.filter(cuenta).sort(compararFecha)
  let mejor = 0
  let peor = 0
  let signoActual: 'ganadas' | 'perdidas' | null = null
  let nActual = 0
  for (const a of orden) {
    const r = num(a.resultado_economico)
    if (r === 0) continue
    const signo = r > 0 ? 'ganadas' : 'perdidas'
    nActual = signo === signoActual ? nActual + 1 : 1
    signoActual = signo
    if (signo === 'ganadas') mejor = Math.max(mejor, nActual)
    else peor = Math.max(peor, nActual)
  }
  return { actual: signoActual ? { signo: signoActual, n: nActual } : null, mejor, peor }
}

export function compararFecha(a: ApuestaAnalisis, b: ApuestaAnalisis): number {
  return (
    Date.parse(a.fecha) - Date.parse(b.fecha) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

// ---------- Resumen superior ----------

// "En juego": número e importe de las apuestas pendientes. Desde el 2026-11-09 Análisis lo calcula
// con TODAS las pendientes, sin filtro de fechas (las de partidos futuros tienen fecha futura).
export function enJuego(apuestas: Pick<ApuestaAnalisis, 'estado' | 'importe'>[]): { n: number; importe: number } {
  const p = apuestas.filter((a) => a.estado === 'pendiente')
  return { n: p.length, importe: p.reduce((s, a) => s + num(a.importe), 0) }
}

export type Resumen = Metricas & {
  enJuego: { n: number; importe: number }
  cuotaMedia: number | null
  importeMedio: number | null
  rachas: Rachas
  sinResultado: number // resueltas sin resultado económico (no cuentan)
  divisa: string
}

export function resumen(apuestas: ApuestaAnalisis[]): Resumen {
  const m = metricas(apuestas)
  const resueltas = apuestas.filter(cuenta)
  const pendientes = apuestas.filter((a) => a.estado === 'pendiente')
  const conCuota = resueltas.filter((a) => a.cuota_total != null)
  const nPropias = resueltas.filter((a) => !esCredito(a)).length
  return {
    ...m,
    enJuego: enJuego(pendientes),
    cuotaMedia: dividir(conCuota.reduce((s, a) => s + num(a.cuota_total), 0), conCuota.length),
    importeMedio: dividir(m.importe, nPropias),
    rachas: rachas(apuestas),
    sinResultado: apuestas.filter((a) => esResuelta(a) && a.resultado_economico == null).length,
    divisa: apuestas[0]?.divisa ?? 'EUR',
  }
}

// ---------- Segmentos ----------

export const SEGMENTOS = {
  casa: 'Casa',
  estrategia: 'Estrategia',
  tipo: 'Tipo de apuesta',
  deporte: 'Deporte',
  liga: 'Liga',
  mercado: 'Mercado',
  cuota: 'Rango de cuota',
  directo: 'Directo',
  precipitada: 'Precipitada',
} as const
// Agrupaciones que solo se usan en Evolución (y en su detalle), no en el selector "Por segmento".
export const SEGMENTOS_TODOS = { ...SEGMENTOS, mes: 'Mes', dia: 'Día de la semana' } as const
export type Segmento = keyof typeof SEGMENTOS_TODOS
export const esSegmento = (v: unknown): v is Segmento => typeof v === 'string' && v in SEGMENTOS_TODOS
export const esSegmentoSelector = (v: unknown): v is keyof typeof SEGMENTOS => typeof v === 'string' && v in SEGMENTOS

// Mes (AAAA-MM) y día de la semana (1 = lunes … 7 = domingo) de una fecha, en hora de España.
const fmtMadrid = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function enMadrid(iso: string): { dia: string; mes: string; diaSemana: number } {
  const p = Object.fromEntries(fmtMadrid.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, mes: `${p.year}-${p.month}`, diaSemana: DIAS_EN.indexOf(p.weekday) + 1 }
}
export const NOMBRE_DIA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

export const RANGOS_CUOTA = ['Hasta 1,50', '1,51 – 2,00', '2,01 – 3,00', 'Más de 3,00'] as const

// Rango de la cuota total (límites con <=; lo menor de 1,01 va al primero).
export function rangoCuota(cuota: number | null): string {
  if (cuota == null) return SIN_DATO
  const c = num(cuota)
  if (c <= 1.5) return RANGOS_CUOTA[0]
  if (c <= 2) return RANGOS_CUOTA[1]
  if (c <= 3) return RANGOS_CUOTA[2]
  return RANGOS_CUOTA[3]
}

// Valor de un campo de las selecciones atribuido a la apuesta: si TODAS coinciden (sin
// mayúsculas, tildes ni espacios de más), ese; si todas están vacías, "Sin dato"; si no, "Varios".
// Devuelve la clave normalizada y el texto tal cual (el más usado se elige al agrupar).
export function atribuir(valores: (string | null | undefined)[]): { clave: string; texto: string } {
  const claves = valores.map((v) => normalizar(v))
  if (claves.length === 0 || claves.every((c) => c === '')) return { clave: `#${SIN_DATO}`, texto: SIN_DATO }
  if (claves.every((c) => c === claves[0])) return { clave: claves[0], texto: (valores[0] ?? '').trim() }
  return { clave: `#${VARIOS}`, texto: VARIOS }
}

// Clave y texto de una apuesta en un segmento.
export function claveSegmento(a: ApuestaAnalisis, s: Segmento): { clave: string; texto: string } {
  const fijo = (texto: string) => ({ clave: `#${texto}`, texto })
  const texto = (v: string | null, vacio: string) => (normalizar(v) ? { clave: normalizar(v), texto: (v ?? '').trim() } : fijo(vacio))
  switch (s) {
    case 'casa':
      return texto(a.casa, 'Sin casa')
    case 'estrategia':
      return texto(a.estrategia, 'Sin estrategia')
    case 'tipo':
      return fijo(NOMBRE_TIPO[a.tipo as TipoApuesta] ?? a.tipo)
    case 'deporte':
      return texto(a.deporte, SIN_DATO)
    case 'liga': {
      // Deporte + liga: la "Superliga" de un deporte no es la de otro.
      const r = atribuir(a.selecciones.map((x) => (normalizar(x.liga) ? `${(x.deporte ?? '').trim()} · ${x.liga!.trim()}` : null)))
      return r
    }
    case 'mercado':
      return atribuir(a.selecciones.map((x) => x.mercado))
    case 'cuota':
      return fijo(rangoCuota(a.cuota_total))
    case 'directo':
      return fijo(!a.en_directo ? 'Pre-partido' : a.viendo_partido ? 'Directo viendo' : 'Directo sin ver')
    case 'precipitada':
      return fijo(a.precipitada ? 'Sí' : 'No')
    case 'mes': {
      const { mes } = enMadrid(a.fecha)
      return { clave: `#${mes}`, texto: nombreMes(mes) }
    }
    case 'dia': {
      const { diaSemana } = enMadrid(a.fecha)
      return { clave: `#${diaSemana}`, texto: NOMBRE_DIA[diaSemana] }
    }
  }
}

// `ids`: las apuestas que forman la fila (de la más reciente a la más antigua). La lista del
// detalle sale de aquí, así que su recuento SIEMPRE coincide con la cifra (`n`).
export type FilaSegmento = Metricas & { clave: string; etiqueta: string; muestraPequena: boolean; ids: string[] }

const masRecientePrimero = (lista: ApuestaAnalisis[]) => [...lista].sort((a, b) => compararFecha(b, a)).map((a) => a.id)

// Orden fijo de algunos segmentos (para que no salten de sitio al cambiar el orden).
const ORDEN_FIJO: Partial<Record<Segmento, readonly string[]>> = {
  cuota: [...RANGOS_CUOTA, SIN_DATO],
  directo: ['Pre-partido', 'Directo viendo', 'Directo sin ver'],
  precipitada: ['No', 'Sí'],
}

export type OrdenSegmento = 'beneficio' | 'n'

export function segmentar(apuestas: ApuestaAnalisis[], s: Segmento, orden: OrdenSegmento = 'beneficio'): FilaSegmento[] {
  const grupos = new Map<string, { apuestas: ApuestaAnalisis[]; textos: Map<string, number> }>()
  for (const a of apuestas) {
    if (!cuenta(a)) continue
    const { clave, texto } = claveSegmento(a, s)
    const g = grupos.get(clave) ?? { apuestas: [] as ApuestaAnalisis[], textos: new Map<string, number>() }
    g.apuestas.push(a)
    g.textos.set(texto, (g.textos.get(texto) ?? 0) + 1)
    grupos.set(clave, g)
  }
  const filas: FilaSegmento[] = [...grupos].map(([clave, g]) => {
    // Etiqueta: la forma más usada (empate: la primera en orden alfabético).
    const etiqueta = [...g.textos].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'))[0][0]
    const m = metricas(g.apuestas)
    return { ...m, clave, etiqueta, muestraPequena: m.n < MUESTRA_MINIMA, ids: masRecientePrimero(g.apuestas) }
  })
  const fijo = ORDEN_FIJO[s]
  const posFijo = (f: FilaSegmento) => (fijo ? fijo.indexOf(f.etiqueta) : 0)
  return filas.sort((x, y) =>
    orden === 'n'
      ? y.n - x.n || y.beneficio - x.beneficio || x.etiqueta.localeCompare(y.etiqueta, 'es')
      : y.beneficio - x.beneficio || y.n - x.n || posFijo(x) - posFijo(y) || x.etiqueta.localeCompare(y.etiqueta, 'es'),
  )
}

// ---------- Aciertos por selección: por mercado o por liga (sin dinero) ----------

export const AGRUPACIONES_ACIERTO = { mercado: 'Mercado', liga: 'Liga' } as const
export type AgrupacionAcierto = keyof typeof AGRUPACIONES_ACIERTO
export const esAgrupacionAcierto = (v: unknown): v is AgrupacionAcierto => typeof v === 'string' && v in AGRUPACIONES_ACIERTO

// `ids` / `idsVerdes` / `idsRojas`: apuestas que contienen selecciones de la fila (todas, con
// alguna verde, con alguna roja), de la más reciente a la más antigua. El detalle sale de aquí.
export type FilaAcierto = {
  clave: string
  etiqueta: string
  verdes: number
  rojas: number
  n: number
  pctVerdes: number | null
  muestraPequena: boolean
  ids: string[]
  idsVerdes: string[]
  idsRojas: string[]
}

// Clave de una selección: mercado, o deporte + liga (igual que en los segmentos).
function claveSeleccion(s: SeleccionAnalisis, por: AgrupacionAcierto): { clave: string; texto: string } {
  if (por === 'liga') {
    if (!normalizar(s.liga)) return { clave: `#${SIN_DATO}`, texto: SIN_DATO }
    const texto = `${(s.deporte ?? '').trim()} · ${s.liga!.trim()}`
    return { clave: normalizar(texto), texto }
  }
  return normalizar(s.mercado) ? { clave: normalizar(s.mercado), texto: s.mercado!.trim() } : { clave: `#${SIN_DATO}`, texto: SIN_DATO }
}

// Solo selecciones con estado propio ganada o perdida, de apuestas resueltas (nunca anuladas ni
// pendientes). `tipo` opcional para mirar, p. ej., solo los "mismo partido".
export function aciertos(apuestas: ApuestaAnalisis[], por: AgrupacionAcierto, tipo?: string): FilaAcierto[] {
  type G = { verdes: number; rojas: number; textos: Map<string, number>; todas: Set<ApuestaAnalisis>; conVerde: Set<ApuestaAnalisis>; conRoja: Set<ApuestaAnalisis> }
  const grupos = new Map<string, G>()
  for (const a of apuestas) {
    if (!cuenta(a) || (tipo && a.tipo !== tipo)) continue
    for (const s of a.selecciones) {
      if (s.estado !== 'ganada' && s.estado !== 'perdida') continue
      const { clave, texto } = claveSeleccion(s, por)
      const g = grupos.get(clave) ?? { verdes: 0, rojas: 0, textos: new Map(), todas: new Set(), conVerde: new Set(), conRoja: new Set() }
      g.todas.add(a)
      if (s.estado === 'ganada') {
        g.verdes++
        g.conVerde.add(a)
      } else {
        g.rojas++
        g.conRoja.add(a)
      }
      g.textos.set(texto, (g.textos.get(texto) ?? 0) + 1)
      grupos.set(clave, g)
    }
  }
  return [...grupos]
    .map(([clave, g]) => {
      const n = g.verdes + g.rojas
      const etiqueta = [...g.textos].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'))[0][0]
      return {
        clave,
        etiqueta,
        verdes: g.verdes,
        rojas: g.rojas,
        n,
        pctVerdes: dividir(g.verdes, n),
        muestraPequena: n < MUESTRA_MINIMA,
        ids: masRecientePrimero([...g.todas]),
        idsVerdes: masRecientePrimero([...g.conVerde]),
        idsRojas: masRecientePrimero([...g.conRoja]),
      }
    })
    .sort((x, y) => y.n - x.n || x.etiqueta.localeCompare(y.etiqueta, 'es'))
}

export const aciertosPorMercado = (apuestas: ApuestaAnalisis[], tipo?: string) => aciertos(apuestas, 'mercado', tipo)
export const aciertosPorLiga = (apuestas: ApuestaAnalisis[], tipo?: string) => aciertos(apuestas, 'liga', tipo)

// ---------- Detalle: las apuestas que forman una cifra ----------

export type Color = 'todas' | 'verdes' | 'rojas'
export const esColor = (v: unknown): v is Color => v === 'todas' || v === 'verdes' || v === 'rojas'

export type PeticionDetalle =
  | { vista: 'seg'; seg: Segmento; clave: string }
  | { vista: 'aciertos'; por: AgrupacionAcierto; clave: string; tipo?: string; color: Color }

export type Detalle = {
  titulo: string // "Mercado: Remates"
  etiqueta: string
  ids: string[] // apuestas a listar (más reciente primero)
  n: number // la cifra de la fila (apuestas en segmentos; selecciones en aciertos)
  selecciones?: number // aciertos: selecciones del color elegido
} | null

// Calcula el detalle con LAS MISMAS funciones que la tabla: la lista y la cifra no pueden diferir.
export function detalle(apuestas: ApuestaAnalisis[], p: PeticionDetalle): Detalle {
  if (p.vista === 'seg') {
    const fila = segmentar(apuestas, p.seg).find((f) => f.clave === p.clave)
    if (!fila) return null
    return { titulo: `${SEGMENTOS_TODOS[p.seg]}: ${fila.etiqueta}`, etiqueta: fila.etiqueta, ids: fila.ids, n: fila.n }
  }
  const fila = aciertos(apuestas, p.por, p.tipo).find((f) => f.clave === p.clave)
  if (!fila) return null
  const ids = p.color === 'verdes' ? fila.idsVerdes : p.color === 'rojas' ? fila.idsRojas : fila.ids
  const selecciones = p.color === 'verdes' ? fila.verdes : p.color === 'rojas' ? fila.rojas : fila.n
  return { titulo: `${AGRUPACIONES_ACIERTO[p.por]}: ${fila.etiqueta}`, etiqueta: fila.etiqueta, ids, n: fila.n, selecciones }
}

// ---------- Filtro de fechas (hora de España) ----------

// Orden = orden de las fichas del filtro. "hoy", "ayer" y "7d" desde el 2026-11-06.
export const PERIODOS = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7d': 'Últimos 7 días',
  mes: 'Este mes',
  '30d': 'Últimos 30 días',
  ano: 'Este año',
  todo: 'Todo',
  personalizado: 'Personalizado',
} as const
export type Periodo = keyof typeof PERIODOS
export const esPeriodo = (v: unknown): v is Periodo => typeof v === 'string' && v in PERIODOS

export type Rango = { periodo: Periodo; desde: string | null; hasta: string | null; desdeDia: string; hastaDia: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/
function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const inicioDia = (dia: string) => localAIso(`${dia}T00:00`) as string
const valido = (dia: string | undefined) => (dia && DIA.test(dia) && localAIso(`${dia}T00:00`) ? dia : '')

// Rango del filtro: `desde` incluido y `hasta` EXCLUIDO (ISO UTC), calculados con los días de
// España. Personalizado: los dos días incluidos (si vienen al revés, se dan la vuelta).
export function rangoPeriodo(periodo: Periodo, desdeDia = '', hastaDia = '', ahora = new Date()): Rango {
  const hoy = isoALocal(ahora.toISOString()).slice(0, 10)
  const [y, m] = hoy.split('-')
  switch (periodo) {
    case 'hoy':
      return { periodo, desde: inicioDia(hoy), hasta: inicioDia(sumarDias(hoy, 1)), desdeDia: hoy, hastaDia: hoy }
    case 'ayer': {
      const ayer = sumarDias(hoy, -1)
      return { periodo, desde: inicioDia(ayer), hasta: inicioDia(hoy), desdeDia: ayer, hastaDia: ayer }
    }
    case '7d': {
      const inicio = sumarDias(hoy, -6)
      return { periodo, desde: inicioDia(inicio), hasta: inicioDia(sumarDias(hoy, 1)), desdeDia: inicio, hastaDia: hoy }
    }
    case 'mes': {
      const inicio = `${y}-${m}-01`
      const siguiente = sumarDias(`${y}-${m}-28`, 7).slice(0, 8) + '01'
      return { periodo, desde: inicioDia(inicio), hasta: inicioDia(siguiente), desdeDia: inicio, hastaDia: hoy }
    }
    case '30d': {
      const inicio = sumarDias(hoy, -29)
      return { periodo, desde: inicioDia(inicio), hasta: inicioDia(sumarDias(hoy, 1)), desdeDia: inicio, hastaDia: hoy }
    }
    case 'ano':
      return { periodo, desde: inicioDia(`${y}-01-01`), hasta: inicioDia(`${Number(y) + 1}-01-01`), desdeDia: `${y}-01-01`, hastaDia: hoy }
    case 'personalizado': {
      let d = valido(desdeDia)
      let h = valido(hastaDia)
      if (d && h && d > h) [d, h] = [h, d]
      return { periodo, desde: d ? inicioDia(d) : null, hasta: h ? inicioDia(sumarDias(h, 1)) : null, desdeDia: d, hastaDia: h }
    }
    default:
      return { periodo: 'todo', desde: null, hasta: null, desdeDia: '', hastaDia: '' }
  }
}

export function enRango(fechaIso: string, r: Pick<Rango, 'desde' | 'hasta'>): boolean {
  const t = Date.parse(fechaIso)
  return (r.desde == null || t >= Date.parse(r.desde)) && (r.hasta == null || t < Date.parse(r.hasta))
}

// ---------- Formato para la pantalla ----------

export const porcentaje = (v: number | null, decimales = 1) =>
  v == null ? '—' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v * 100)} %`
export const cuotaMediaTxt = (v: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
export function rachaTxt(r: Racha): string {
  if (!r) return '—'
  return r.signo === 'ganadas' ? `${r.n} ${r.n === 1 ? 'ganada' : 'ganadas'}` : `${r.n} ${r.n === 1 ? 'perdida' : 'perdidas'}`
}
