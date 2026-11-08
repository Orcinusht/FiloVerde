// Registro de apuestas: fecha de la apuesta a partir del partido y "partidos conocidos" (datos de
// un partido que ya registraste). Funciones PURAS (sin base de datos ni React): las usan el
// formulario (en el móvil), el servidor y `npm test`. Fechas y horas en hora de España.

import { localAIso } from './fechas.ts'
import { clavePartido } from './catalogo-gestion.ts'

// ---------- Fecha de la apuesta = el último partido ----------

export type DiaHora = { dia: string; hora: string } // "AAAA-MM-DD", "HH:MM" ('' = sin hora)
type ConFecha = { evento_fecha?: string | null; evento_hora?: string | null }

const HORA_SIN_HORA = '12:00'

// El último partido de la apuesta (cuando se resuelve): la selección con el día y hora más tardíos.
// Sin hora cuenta como las 12:00. null si ninguna selección tiene día.
export function ultimoPartido(selecciones: ConFecha[]): DiaHora | null {
  let mejor: DiaHora | null = null
  let clave = ''
  for (const s of selecciones) {
    const dia = (s.evento_fecha ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue
    const hora = /^\d{2}:\d{2}/.test(s.evento_hora ?? '') ? (s.evento_hora as string).slice(0, 5) : ''
    const k = `${dia}T${hora || HORA_SIN_HORA}`
    if (k > clave) {
      clave = k
      mejor = { dia, hora }
    }
  }
  return mejor
}

// Instante (ISO) del partido en hora de España; sin hora, las 12:00. Una hora que no existe por el
// cambio de hora (p. ej. 02:30 del último domingo de marzo) pasa a la siguiente válida (03:30): el
// DÍA nunca cambia.
export function instanteDelPartido(p: DiaHora): string | null {
  const iso = localAIso(`${p.dia}T${p.hora || HORA_SIN_HORA}`)
  return iso ?? null
}

// ---------- Partidos conocidos ----------

// Una selección ya guardada (o de la tanda) de la que aprender.
export type SeleccionConocida = {
  evento: string | null
  evento_fecha: string | null
  evento_hora: string | null
  liga: string | null
  deporte: string | null
  creada?: string // ISO; desempate (la más reciente gana)
}

// Lo que se sabe de un partido en un día concreto.
export type DiaConocido = { dia: string; hora: string; liga: string; deporte: string; n: number }

// Solo cuenta como partido un evento con dos lados ("A - B", "A vs B"…): así no se emparejan
// textos sueltos como "Sinner" o "Goles".
export function claveConocida(evento: string | null | undefined): string {
  const c = clavePartido(evento)
  const [a, b, ...resto] = c.split(' - ')
  return a && b && resto.length === 0 ? c : ''
}

// Agrupa por partido (clave) y por día. En cada día: la hora, la liga y el deporte más repetidos
// (no vacíos); empate → el de la selección más reciente.
export function agruparConocidos(lista: SeleccionConocida[]): Map<string, DiaConocido[]> {
  type Cuenta = Map<string, { n: number; reciente: string }>
  const grupos = new Map<string, Map<string, { n: number; hora: Cuenta; liga: Cuenta; deporte: Cuenta }>>()
  const sumar = (c: Cuenta, v: string | null | undefined, creada: string) => {
    const t = (v ?? '').trim()
    if (!t) return
    const x = c.get(t) ?? { n: 0, reciente: '' }
    x.n++
    if (creada > x.reciente) x.reciente = creada
    c.set(t, x)
  }
  for (const s of lista) {
    const clave = claveConocida(s.evento)
    const dia = (s.evento_fecha ?? '').slice(0, 10)
    if (!clave || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue
    const porDia = grupos.get(clave) ?? new Map()
    const g = porDia.get(dia) ?? { n: 0, hora: new Map(), liga: new Map(), deporte: new Map() }
    g.n++
    const creada = s.creada ?? ''
    sumar(g.hora, (s.evento_hora ?? '').slice(0, 5), creada)
    sumar(g.liga, s.liga, creada)
    sumar(g.deporte, s.deporte, creada)
    porDia.set(dia, g)
    grupos.set(clave, porDia)
  }
  const elegir = (c: Cuenta) => [...c].sort((x, y) => y[1].n - x[1].n || (y[1].reciente > x[1].reciente ? 1 : -1))[0]?.[0] ?? ''
  const out = new Map<string, DiaConocido[]>()
  for (const [clave, porDia] of grupos) {
    out.set(
      clave,
      [...porDia]
        .map(([dia, g]) => ({ dia, hora: elegir(g.hora), liga: elegir(g.liga), deporte: elegir(g.deporte), n: g.n }))
        .sort((a, b) => (a.dia < b.dia ? 1 : -1)), // más reciente primero
    )
  }
  return out
}

// Para proponer DÍA y HORA a un partido sin fecha en la captura, solo valen los de los últimos
// 30 días o futuros (un partido con el mismo nombre de otra temporada no es este).
export const DIAS_RECIENTES = 30

function restarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

export type CamposPartido = 'evento_fecha' | 'evento_hora' | 'liga' | 'deporte'
export type SeleccionRevision = { evento: string; evento_fecha: string; evento_hora: string; liga: string; deporte: string }

export type Propuesta = {
  cambios: Partial<Record<CamposPartido, string>> // solo campos que estaban VACÍOS
  origen: DiaConocido // de qué día sale
  otrosDias: DiaConocido[] // otras fechas recientes del mismo partido (para elegir con un toque)
}

// Qué rellenar en una selección con lo que se sabe del partido. Nunca pisa un dato que ya trae
// (la captura o el usuario): solo rellena campos vacíos.
//  · Con día en la selección: solo vale el mismo día (hora, liga y deporte).
//  · Sin día: el día reciente (≤ 30 días o futuro) más reciente → día, hora, liga y deporte; los
//    demás días recientes, como opciones. Si solo hay días antiguos: liga y deporte del más
//    reciente (sin día ni hora).
export function proponerPartido(s: SeleccionRevision, conocidos: Map<string, DiaConocido[]>, hoy: string): Propuesta | null {
  const clave = claveConocida(s.evento)
  const dias = clave ? conocidos.get(clave) : undefined
  if (!dias?.length) return null
  const vacio = (v: string) => !v.trim()
  const cambios: Propuesta['cambios'] = {}
  const poner = (c: CamposPartido, v: string) => {
    if (v && vacio(s[c])) cambios[c] = v
  }
  let origen: DiaConocido | undefined
  let otrosDias: DiaConocido[] = []
  if (!vacio(s.evento_fecha)) {
    origen = dias.find((d) => d.dia === s.evento_fecha.slice(0, 10))
    if (!origen) return null
    poner('evento_hora', origen.hora)
  } else {
    const limite = restarDias(hoy, DIAS_RECIENTES)
    const recientes = dias.filter((d) => d.dia >= limite)
    if (recientes.length) {
      origen = recientes[0]
      otrosDias = recientes.slice(1)
      poner('evento_fecha', origen.dia)
      poner('evento_hora', origen.hora)
    } else origen = dias[0]
  }
  poner('liga', origen.liga)
  poner('deporte', origen.deporte)
  if (Object.keys(cambios).length === 0 && otrosDias.length === 0) return null
  return { cambios, origen, otrosDias }
}

// "partido del 8 nov, 21:00" (o sin hora).
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
export function textoDiaHora(d: { dia: string; hora: string }): string {
  const [, m, dd] = d.dia.split('-').map(Number)
  return `${dd} ${MESES[m - 1]}${d.hora ? `, ${d.hora}` : ''}`
}

// Tanda de capturas: las selecciones de las apuestas ANTERIORES a la actual (guardadas o con lo
// que se ha editado, aunque aún no se hayan guardado), para rellenar el mismo partido. Las
// descartadas no cuentan.
export function conocidosDeTanda(
  anteriores: { selecciones: { evento: string; evento_fecha: string; evento_hora: string; liga: string; deporte: string }[] }[],
): SeleccionConocida[] {
  // Orden de "creada": la apuesta más cercana a la actual gana los empates.
  return anteriores.flatMap((v, k) =>
    v.selecciones.map((s) => ({
      evento: s.evento,
      evento_fecha: s.evento_fecha || null,
      evento_hora: s.evento_hora || null,
      liga: s.liga || null,
      deporte: s.deporte || null,
      creada: String(k).padStart(4, '0'),
    })),
  )
}

// Formulario: qué día de la apuesta toca. En una apuesta NUEVA, el del último partido mientras no
// se haya cambiado a mano; al editar una guardada (o tras cambiarla a mano), el que ya tiene.
export function diaSegunPartido(o: { fecha: string; nueva: boolean; manual: boolean; partido: DiaHora | null }): string {
  if (!o.nueva || o.manual || !o.partido) return o.fecha
  return o.partido.dia
}
