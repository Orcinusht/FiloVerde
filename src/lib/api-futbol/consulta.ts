// API-Football: de las selecciones de la revisión a lo que se enseña en el formulario.
//   1. Días a consultar: el de cada selección; sin día, de hoy − 7 a hoy + 2 (por los nombres de los
//      equipos; si el mismo cruce sale en varios días, fichas con el día).
//   2. Emparejar cada selección con los partidos de su día (o de los tres días).
//   3. Si una selección CON día no aparece ese día, se mira el día antes y el después: si el
//      partido está ahí, sale como sugerencia ("la API indica el 4 nov"), nunca se impone.
// Lo que se devuelve al móvil: solo datos de partidos y ligas (nunca la clave ni nada de la cuenta).

import {
  claveEquipo,
  diasAConsultar,
  emparejar,
  esDeFutbol,
  ladosDelEvento,
  ligaParaPartido,
  ligasApiDe,
  sumarDias,
  type Candidato,
  type EquivalenciaLiga,
  type LigaCatalogo,
  type LigaPropuesta,
  type PartidoApi,
} from './emparejar.ts'
import type { Aviso, ResultadoDias } from './servicio.ts'

export type SeleccionConsulta = { indice: number; evento: string; fecha: string; hora: string; liga: string; deporte: string }

export type PartidoCliente = {
  id: number
  fecha: string
  hora: string
  local: string
  visitante: string
  invertido: boolean
  liga: LigaPropuesta & { apiId: number; apiNombreOriginal: string; pais: string }
}

export type ResultadoSeleccion =
  | { indice: number; nivel: 'clara'; partido: PartidoCliente }
  | { indice: number; nivel: 'varias'; partidos: PartidoCliente[] }
  | { indice: number; nivel: 'otro_dia'; partidos: PartidoCliente[] } // la captura dice otro día
  | { indice: number; nivel: 'ninguna' }

export type Contexto = {
  hoy: string
  catalogoFutbol: LigaCatalogo[]
  equivalencias: EquivalenciaLiga[]
  recordados: Map<string, number> // claveEquipo → id de equipo de la API
}

export type RespuestaConsulta = { activa: boolean; resultados: ResultadoSeleccion[]; aviso: string | null }

function aCliente(c: Candidato, ctx: Contexto): PartidoCliente {
  const p = c.partido
  return {
    id: p.id,
    fecha: p.fecha,
    hora: p.hora,
    local: p.local,
    visitante: p.visitante,
    invertido: c.invertido,
    liga: { ...ligaParaPartido(p, ctx.catalogoFutbol, ctx.equivalencias), apiId: p.liga_id, apiNombreOriginal: p.liga, pais: p.pais },
  }
}

const juntar = (porDia: Map<string, PartidoApi[]>, dias: string[]) => dias.flatMap((d) => porDia.get(d) ?? [])

// Mensaje para el usuario cuando la API no ha podido responder (nunca bloquea el registro).
export function textoAviso(avisos: Set<Aviso>): string | null {
  if (avisos.has('clave')) return 'API-Football no acepta la clave configurada: sigue como siempre (revisa Ajustes → API-Football).'
  if (avisos.has('tope') || avisos.has('restantes')) return 'Hoy ya no quedan consultas a API-Football: sigue como siempre.'
  if (avisos.size) return 'No se ha podido consultar API-Football ahora mismo: sigue como siempre.'
  return null
}

export async function consultarSelecciones(
  seleccionesEntrada: SeleccionConsulta[],
  ctx: Contexto,
  obtenerDias: (fechas: string[]) => Promise<ResultadoDias>,
  quedaTiempo: () => boolean = () => true,
): Promise<{ resultados: ResultadoSeleccion[]; avisos: Set<Aviso> }> {
  const sels = seleccionesEntrada.filter((s) => esDeFutbol(s.deporte) && ladosDelEvento(s.evento))
  const avisos = new Set<Aviso>()
  if (!sels.length) return { resultados: [], avisos }
  const diasDe = (s: SeleccionConsulta) => (s.fecha ? [s.fecha] : diasAConsultar([null], ctx.hoy))

  const r1 = await obtenerDias(diasAConsultar(sels.map((s) => s.fecha || null), ctx.hoy))
  r1.avisos.forEach((a) => avisos.add(a))
  const porDia = new Map(r1.partidos)

  const buscar = (s: SeleccionConsulta, dias: string[]) => {
    const lista = juntar(porDia, dias)
    return emparejar(
      { evento: s.evento, hora: s.hora || undefined, ligasPosibles: s.liga ? ligasApiDe(s.liga, ctx.catalogoFutbol, ctx.equivalencias, lista) : undefined, recordados: ctx.recordados },
      lista,
    )
  }

  const resultados: ResultadoSeleccion[] = []
  const sinCoincidencia: SeleccionConsulta[] = []
  for (const s of sels) {
    const r = buscar(s, diasDe(s))
    if (r.nivel === 'clara') resultados.push({ indice: s.indice, nivel: 'clara', partido: aCliente(r.candidato, ctx) })
    else if (r.nivel === 'varias') resultados.push({ indice: s.indice, nivel: 'varias', partidos: r.candidatos.map((c) => aCliente(c, ctx)) })
    else if (s.fecha) sinCoincidencia.push(s)
    else resultados.push({ indice: s.indice, nivel: 'ninguna' })
  }

  // Día de la captura sin coincidencia: ¿está el partido el día antes o el después?
  if (sinCoincidencia.length && quedaTiempo()) {
    const vecinos = [...new Set(sinCoincidencia.flatMap((s) => [sumarDias(s.fecha, -1), sumarDias(s.fecha, 1)]))].filter((d) => !porDia.has(d)).sort()
    if (vecinos.length) {
      const r2 = await obtenerDias(vecinos)
      r2.avisos.forEach((a) => avisos.add(a))
      for (const [d, l] of r2.partidos) porDia.set(d, l)
    }
  }
  for (const s of sinCoincidencia) {
    const r = buscar(s, [sumarDias(s.fecha, -1), sumarDias(s.fecha, 1)])
    if (r.nivel === 'clara') resultados.push({ indice: s.indice, nivel: 'otro_dia', partidos: [aCliente(r.candidato, ctx)] })
    else if (r.nivel === 'varias') resultados.push({ indice: s.indice, nivel: 'otro_dia', partidos: r.candidatos.map((c) => aCliente(c, ctx)) })
    else resultados.push({ indice: s.indice, nivel: 'ninguna' })
  }
  return { resultados: resultados.sort((a, b) => a.indice - b.indice), avisos }
}

// Equivalencias recordadas → mapa para el emparejado.
export function mapaRecordados(filas: { nombre_captura: string; equipo_id: number }[]): Map<string, number> {
  return new Map(filas.map((f) => [f.nombre_captura, f.equipo_id]))
}
export { claveEquipo }
