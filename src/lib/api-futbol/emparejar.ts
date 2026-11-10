// API-Football (solo fútbol): emparejar el partido escrito en la captura con los partidos
// oficiales de la API, elegir qué rellenar y con qué liga de tu catálogo. Funciones PURAS (sin
// red, base de datos ni React): las usan el servidor, el formulario y `npm test`.

import { normalizar } from '../apuestas/catalogo.ts'

// Un partido de la API tal como se guarda en la caché (solo los campos necesarios).
export type PartidoApi = {
  id: number
  fecha: string // AAAA-MM-DD (hora de España)
  hora: string // HH:MM o ''
  liga_id: number
  liga: string
  pais: string
  local_id: number
  local: string
  visitante_id: number
  visitante: string
  estado: string // NS, FT, PST… (código corto de la API)
}

// ---------- nombres de equipos ----------

// Equivalencias comunes español → nombre de la API (pequeña y mantenible: lo demás lo hace el
// parecido de palabras y lo que recuerdes al elegir). Una entrada puede dar varias palabras.
const EQUIVALENCIAS: Record<string, string> = {
  munich: 'munchen',
  muenchen: 'munchen',
  colonia: 'koln',
  koeln: 'koln',
  napoles: 'napoli',
  oporto: 'porto',
  brujas: 'brugge',
  marsella: 'marseille',
  niza: 'nice',
  turin: 'torino',
  florencia: 'fiorentina',
  moscu: 'moscow',
  gladbach: 'monchengladbach',
  utd: 'united',
  man: 'manchester',
  spurs: 'tottenham',
  wolves: 'wolverhampton',
  psg: 'paris saint germain',
  st: 'saint',
}

// Palabras vacías: no distinguen a un equipo de otro ("FC Barcelona" = "Barcelona").
const VACIAS = new Set([
  'fc', 'cf', 'sk', 'sc', 'ac', 'afc', 'cd', 'ud', 'sd', 'rc', 'rcd', 'fk', 'sv', 'ssc', 'as', 'ca', 'cp',
  'club', 'de', 'del', 'la', 'el', 'the', 'do', 'da', 'des', 'di', 'vfb', 'vfl', 'tsg', 'bk', 'if', 'ik', 'us', 'ss',
])

// Palabras que DISTINGUEN a un equipo de otro con el mismo nombre (femenino, filial, sub-21…).
// Se pasan a una forma común y tienen que coincidir en los dos nombres.
const DISTINTIVAS: Record<string, string> = {
  femenino: 'fem', femenina: 'fem', femeni: 'fem', fem: 'fem', women: 'fem', woman: 'fem', w: 'fem', wfc: 'fem', ladies: 'fem', feminas: 'fem',
  b: 'b', ii: 'b', castilla: 'b', atletic: 'b', reserves: 'b', reserve: 'b', promesas: 'b',
  iii: 'c', c: 'c',
  juvenil: 'u19', youth: 'u19',
}

export type NombreEquipo = { palabras: string[]; distintivas: string[] }

function sinTildes(t: string): string {
  return t
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[øö]/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function normalizarEquipo(nombre: string | null | undefined): NombreEquipo {
  const crudas = sinTildes(nombre ?? '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const palabras: string[] = []
  const distintivas: string[] = []
  for (let i = 0; i < crudas.length; i++) {
    let p = crudas[i]
    // "Sub-21", "sub 21", "U21", "U-21" → u21
    if ((p === 'sub' || p === 'u') && /^\d{2}$/.test(crudas[i + 1] ?? '')) p = `u${crudas[++i]}`
    else if (/^sub\d{2}$/.test(p)) p = `u${p.slice(3)}`
    if (/^u\d{2}$/.test(p)) {
      distintivas.push(p)
      continue
    }
    if (DISTINTIVAS[p]) {
      distintivas.push(DISTINTIVAS[p])
      continue
    }
    for (const q of (EQUIVALENCIAS[p] ?? p).split(' ')) if (!VACIAS.has(q)) palabras.push(q)
  }
  return { palabras, distintivas: [...new Set(distintivas)].sort() }
}

// Clave con la que se RECUERDA un nombre escrito en la captura (equivalencias por usuario).
export function claveEquipo(nombre: string | null | undefined): string {
  const n = normalizarEquipo(nombre)
  return [...n.palabras, ...n.distintivas.map((d) => `#${d}`)].join(' ').slice(0, 120)
}

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1))
      previo = t
    }
  }
  return fila[b.length]
}

// ¿Son la misma palabra? Igual; una empieza por la otra (≥ 4 letras: "inter"/"internacional");
// o se diferencian en una letra (≥ 5 letras: erratas).
function palabraIgual(a: string, b: string): boolean {
  if (a === b) return true
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a]
  if (corta.length >= 4 && larga.startsWith(corta)) return true
  return corta.length >= 5 && distancia(a, b) <= 1
}

// Parecido entre dos nombres de equipo, de 0 a 1. Cuenta las palabras en común sobre el nombre
// más corto ("Stuttgart" = "VfB Stuttgart") con un pequeño extra si coinciden todas. Si las
// palabras distintivas no son las mismas (femenino, filial, sub-21…), casi cero.
export function parecidoEquipos(captura: NombreEquipo, api: NombreEquipo): number {
  if (!captura.palabras.length || !api.palabras.length) return 0
  const usadas = new Set<number>()
  let comunes = 0
  for (const p of captura.palabras) {
    const j = api.palabras.findIndex((q, k) => !usadas.has(k) && palabraIgual(p, q))
    if (j >= 0) {
      usadas.add(j)
      comunes++
    }
  }
  const min = Math.min(captura.palabras.length, api.palabras.length)
  const max = Math.max(captura.palabras.length, api.palabras.length)
  let s = (comunes / min) * (0.85 + 0.15 * (comunes / max))
  if (captura.distintivas.join() !== api.distintivas.join()) s *= 0.2
  return s
}

// ---------- partido ----------

// "A - B", "A vs B", "A v B", "A – B" → [A, B]; null si no tiene dos lados.
export function ladosDelEvento(evento: string | null | undefined): [string, string] | null {
  const t = (evento ?? '').trim()
  // Primero separadores con espacios (así "Paris Saint-Germain - Lyon" no se parte en el guion
  // del nombre); si no hay, un único guion pegado ("Betis-Sevilla").
  let partes = t.split(/\s+(?:-|–|—|vs\.?|v\.?)\s+|\s*[–—]\s*/i)
  if (partes.length === 1) partes = t.split('-')
  if (partes.length !== 2) return null
  const [a, b] = partes.map((x) => x.trim())
  return a && b ? [a, b] : null
}

export type Busqueda = {
  evento: string
  hora?: string // la de la captura (si la hay)
  ligasPosibles?: Set<number> // ids de liga de la API que corresponden a la liga leída (si la hay)
  recordados?: Map<string, number> // claveEquipo(nombre de la captura) → id del equipo en la API
}

export type Candidato = { partido: PartidoApi; puntos: number; invertido: boolean }

export const UMBRAL_EQUIPO = 0.5 // cada equipo, como mínimo
export const UMBRAL_CANDIDATO = 0.6 // para salir como "partido posible"
export const UMBRAL_CLARO = 0.75 // para rellenar solo
export const VENTAJA_CLARA = 0.1 // sobre el segundo

function puntosEquipo(nombre: string, id: number, apiNombre: string, recordados?: Map<string, number>): number {
  const rec = recordados?.get(claveEquipo(nombre))
  if (rec === id) return 1
  const s = parecidoEquipos(normalizarEquipo(nombre), normalizarEquipo(apiNombre))
  return rec !== undefined ? s * 0.6 : s // recordado como OTRO equipo: menos probable
}

function minutos(h: string): number {
  const [a, b] = h.split(':').map(Number)
  return a * 60 + b
}

// Puntúa todos los partidos y devuelve los posibles, de mejor a peor.
export function candidatos(b: Busqueda, partidos: PartidoApi[]): Candidato[] {
  const lados = ladosDelEvento(b.evento)
  if (!lados) return []
  const [A, B] = lados
  const out: Candidato[] = []
  for (const p of partidos) {
    const directo = [puntosEquipo(A, p.local_id, p.local, b.recordados), puntosEquipo(B, p.visitante_id, p.visitante, b.recordados)]
    const reves = [puntosEquipo(A, p.visitante_id, p.visitante, b.recordados), puntosEquipo(B, p.local_id, p.local, b.recordados)]
    const media = (x: number[]) => (x[0] >= UMBRAL_EQUIPO && x[1] >= UMBRAL_EQUIPO ? (x[0] + x[1]) / 2 : 0)
    const d = media(directo)
    const r = media(reves) - 0.15 // equipos al revés: posible, pero menos probable
    const invertido = r > d
    let puntos = Math.max(d, r)
    if (puntos <= 0) continue
    if (b.hora && p.hora) {
      const dif = Math.abs(minutos(b.hora) - minutos(p.hora))
      puntos += dif === 0 ? 0.15 : dif <= 15 ? 0.05 : -0.15
    }
    if (b.ligasPosibles?.has(p.liga_id)) puntos += 0.15
    if (puntos >= UMBRAL_CANDIDATO) out.push({ partido: p, puntos: Math.round(puntos * 1000) / 1000, invertido })
  }
  return out.sort((x, y) => y.puntos - x.puntos || x.partido.id - y.partido.id)
}

export type Resultado =
  | { nivel: 'clara'; candidato: Candidato }
  | { nivel: 'varias'; candidatos: Candidato[] } // hasta 3, sin ninguno elegido
  | { nivel: 'ninguna' }

export const MAX_POSIBLES = 3

export function clasificar(lista: Candidato[]): Resultado {
  if (!lista.length) return { nivel: 'ninguna' }
  const [primero, segundo] = lista
  if (primero.puntos >= UMBRAL_CLARO && (!segundo || primero.puntos - segundo.puntos >= VENTAJA_CLARA)) {
    return { nivel: 'clara', candidato: primero }
  }
  return { nivel: 'varias', candidatos: lista.slice(0, MAX_POSIBLES) }
}

export function emparejar(b: Busqueda, partidos: PartidoApi[]): Resultado {
  return clasificar(candidatos(b, partidos))
}

// ---------- ligas ----------

// "UEFA Champions League" = "Champions League"; "La Liga" = "LaLiga".
export function normalizarLiga(nombre: string | null | undefined): string {
  return sinTildes(nombre ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && p !== 'uefa')
    .join('')
}

const PAISES: Record<string, string> = {
  Spain: 'España', England: 'Inglaterra', Italy: 'Italia', Germany: 'Alemania', France: 'Francia', Brazil: 'Brasil',
  Netherlands: 'Países Bajos', Turkey: 'Turquía', Belgium: 'Bélgica', Scotland: 'Escocia', Mexico: 'México',
  USA: 'EE. UU.', Wales: 'Gales', Greece: 'Grecia', Switzerland: 'Suiza', Denmark: 'Dinamarca', Sweden: 'Suecia',
  Norway: 'Noruega', Poland: 'Polonia', Russia: 'Rusia', Japan: 'Japón', Croatia: 'Croacia',
}
export const paisEnEspanol = (p: string) => PAISES[p] ?? p

export type LigaCatalogo = { id: string; nombre: string; archivada?: boolean }
export type EquivalenciaLiga = { liga_api_id: number; liga_id: string }
export type LigaPropuesta = {
  nombre: string // lo que se pone en la selección
  enCatalogo: boolean // false = se propone crearla ("Crear y usar" o "Usar una de mis ligas")
  archivada: boolean // en tu catálogo pero archivada (se ofrece "Recuperar")
  apiNombre: string // "La Liga (España)" para mostrar de dónde sale
}

const RESERVADAS_LIGA = ['sin dato', 'varios']

// Qué liga de TU catálogo de fútbol corresponde a la de la API:
//   1. la que recordaste (equivalencia guardada por id de liga de la API);
//   2. la de tu catálogo con el mismo nombre (sin mayúsculas, tildes, espacios ni "UEFA"), si no
//      la tienes ya enlazada a OTRA liga de la API;
//   3. si no, se propone el nombre de la API. Si ya tienes una liga con ese nombre enlazada a otra
//      competición (p. ej. "Serie A" de Italia y llega la de Brasil) o es un nombre reservado, se
//      añade el país: "Serie A (Brasil)".
export function ligaParaPartido(
  p: Pick<PartidoApi, 'liga_id' | 'liga' | 'pais'>,
  catalogoFutbol: LigaCatalogo[],
  equivalencias: EquivalenciaLiga[],
): LigaPropuesta {
  const apiNombre = p.pais && p.pais !== 'World' ? `${p.liga} (${paisEnEspanol(p.pais)})` : p.liga
  const eq = equivalencias.find((e) => e.liga_api_id === p.liga_id)
  const recordada = eq && catalogoFutbol.find((l) => l.id === eq.liga_id)
  if (recordada) return { nombre: recordada.nombre, enCatalogo: true, archivada: !!recordada.archivada, apiNombre }
  const n = normalizarLiga(p.liga)
  const mismoNombre = catalogoFutbol.find((l) => normalizarLiga(l.nombre) === n)
  const deOtra = mismoNombre && equivalencias.some((e) => e.liga_id === mismoNombre.id && e.liga_api_id !== p.liga_id)
  if (mismoNombre && !deOtra) return { nombre: mismoNombre.nombre, enCatalogo: true, archivada: !!mismoNombre.archivada, apiNombre }
  const reservado = RESERVADAS_LIGA.includes(normalizar(p.liga))
  const nombre = (deOtra || reservado) && apiNombre !== p.liga ? apiNombre : p.liga
  return { nombre: nombre.slice(0, 80), enCatalogo: false, archivada: false, apiNombre }
}

// Ids de liga de la API que corresponden a la liga leída (para desempatar).
export function ligasApiDe(ligaLeida: string, catalogoFutbol: LigaCatalogo[], equivalencias: EquivalenciaLiga[], partidos: PartidoApi[]): Set<number> {
  const out = new Set<number>()
  const n = normalizarLiga(ligaLeida)
  if (!n) return out
  const cat = catalogoFutbol.find((l) => normalizarLiga(l.nombre) === n)
  for (const e of equivalencias) if (cat && e.liga_id === cat.id) out.add(e.liga_api_id)
  for (const p of partidos) {
    const np = normalizarLiga(p.liga)
    if (np === n || (n.length >= 6 && (np.includes(n) || n.includes(np)))) out.add(p.liga_id)
  }
  return out
}

// ---------- qué rellenar en la selección ----------

export type CampoPartido = 'evento_fecha' | 'evento_hora' | 'liga' | 'deporte'
export type SeleccionActual = Record<CampoPartido, string>
// Marca actual de cada campo: undefined = dato claro (de la captura o escrito por ti) · 'api' = lo
// puso API-Football · cualquier otra = dudoso (ámbar) o deducido de otra apuesta.
export type Marcas = Partial<Record<CampoPartido, string | undefined>>

export type Relleno = {
  cambios: Partial<SeleccionActual> // se aplican y se marcan "confirmado por API-Football"
  confirmados: CampoPartido[] // ya coincidían con la API: también llevan la marca azul
  sugerencias: { dia?: string; hora?: string; liga?: string; deporte?: string } // la captura dice otra cosa: no se impone
}

// Nunca pisa un dato que la captura muestre con claridad (ni lo que hayas escrito tú):
//   · día: solo si está vacío; si es otro, sugerencia ("la API indica el 4 nov").
//   · hora y liga: si están vacías o dudosas (ámbar, deducidas de otra apuesta o puestas antes por
//     la API); si la captura las muestra claras y son otras, sugerencia.
//   · deporte: "Fútbol" (de tu catálogo) si está vacío o ya es fútbol. Si es OTRO deporte (la IA se
//     equivocó), no se toca nada: todo el partido queda como sugerencia ("Usar Fútbol").
//   · lo que ya coincide con la API se marca igualmente como confirmado.
export function decidirRelleno(s: SeleccionActual, marcas: Marcas, p: PartidoApi, liga: string, futbol: string): Relleno {
  const cambios: Partial<SeleccionActual> = {}
  const confirmados: CampoPartido[] = []
  const sugerencias: Relleno['sugerencias'] = {}
  if (!esDeFutbol(s.deporte)) return { cambios, confirmados, sugerencias: { deporte: futbol } }
  const vacio = (c: CampoPartido) => !s[c].trim()
  const sustituible = (c: CampoPartido) => vacio(c) || (marcas[c] !== undefined && marcas[c] !== 'nueva')
  if (vacio('evento_fecha')) cambios.evento_fecha = p.fecha
  else if (s.evento_fecha.slice(0, 10) !== p.fecha) sugerencias.dia = p.fecha
  else confirmados.push('evento_fecha')
  const mismoDia = vacio('evento_fecha') || s.evento_fecha.slice(0, 10) === p.fecha
  if (p.hora) {
    if (mismoDia && s.evento_hora.slice(0, 5) === p.hora) confirmados.push('evento_hora')
    else if (mismoDia && sustituible('evento_hora')) cambios.evento_hora = p.hora
    else if (s.evento_hora.slice(0, 5) !== p.hora) sugerencias.hora = p.hora
  }
  if (liga) {
    if (normalizarLiga(s.liga) === normalizarLiga(liga) && s.liga.trim()) {
      if (s.liga !== liga && sustituible('liga')) cambios.liga = liga
      else confirmados.push('liga')
    } else if (sustituible('liga')) cambios.liga = liga
    else sugerencias.liga = liga
  }
  if (s.deporte !== futbol) cambios.deporte = futbol // vacío o fútbol escrito de otra forma
  else confirmados.push('deporte')
  return { cambios, confirmados, sugerencias }
}

// ¿Se consulta esta selección? Solo fútbol (o sin deporte) y con un partido de dos lados.
export function esDeFutbol(deporte: string): boolean {
  const n = normalizar(deporte)
  return n === '' || n === 'futbol' || n === 'football' || n === 'soccer'
}

// ---------- caché, días y tope ----------

export const HORAS_FRESCURA = 6
export const DIAS_CACHE = 90

export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Sin día en la captura (las de apuestas ya resueltas casi nunca lo traen) se busca por los
// nombres de los equipos en una ventana de 7 días hacia atrás y 2 hacia delante (10 días). Los días
// pasados ya consultados están en la caché para siempre: no gastan llamadas.
export const DIAS_ATRAS = 7
export const DIAS_ADELANTE = 2

// Días que hay que consultar: el de cada selección; sin día, la ventana de hoy − 7 a hoy + 2.
export function diasAConsultar(dias: (string | null | undefined)[], hoy: string): string[] {
  const out = new Set<string>()
  for (const d of dias) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d)
    else for (let k = -DIAS_ATRAS; k <= DIAS_ADELANTE; k++) out.add(sumarDias(hoy, k))
  }
  return [...out].sort()
}

// ¿Vale la caché de un día? Días pasados: una vez consultados ya pasados, para siempre. Hoy y
// futuros: menos de 6 horas. Incompleta (faltaron páginas): nunca vale como definitiva.
export function cacheVigente(f: { fecha: string; actualizado: string; completo: boolean }, hoy: string, ahora: Date): boolean {
  if (!f.completo) return false
  const actualizado = new Date(f.actualizado)
  if (Number.isNaN(actualizado.getTime())) return false
  if (f.fecha < hoy) {
    // Consultado cuando el día ya había terminado (en España): margen de un día por la zona.
    return actualizado.getTime() >= Date.parse(`${sumarDias(f.fecha, 1)}T00:00:00Z`) + 2 * 3600_000
  }
  return ahora.getTime() - actualizado.getTime() < HORAS_FRESCURA * 3600_000
}

export type Uso = { llamadas: number; restantes: number | null; pausa_hasta: string | null }
export type Permiso = { ok: true } | { ok: false; motivo: 'tope' | 'restantes' | 'pausa' }

export const TOPE_POR_DEFECTO = 300
export const MINIMO_RESTANTES = 50

export function puedeLlamar(uso: Uso | null, tope: number, minimoRestantes: number, ahora: Date): Permiso {
  if (!uso) return tope > 0 ? { ok: true } : { ok: false, motivo: 'tope' }
  if (uso.pausa_hasta && Date.parse(uso.pausa_hasta) > ahora.getTime()) return { ok: false, motivo: 'pausa' }
  if (uso.llamadas >= tope) return { ok: false, motivo: 'tope' }
  if (uso.restantes !== null && uso.restantes < minimoRestantes) return { ok: false, motivo: 'restantes' }
  return { ok: true }
}

// ---------- recordar al guardar ----------

// Qué equivalencias de equipos guardar: cada lado de la captura con el equipo que le corresponde.
export function equiposARecordar(evento: string, p: PartidoApi, invertido: boolean): { nombre_captura: string; equipo_id: number; equipo_nombre: string }[] {
  const lados = ladosDelEvento(evento)
  if (!lados) return []
  const [A, B] = lados
  const [eA, eB] = invertido ? [[p.visitante_id, p.visitante], [p.local_id, p.local]] : [[p.local_id, p.local], [p.visitante_id, p.visitante]]
  return [
    { nombre_captura: claveEquipo(A), equipo_id: eA[0] as number, equipo_nombre: String(eA[1]).slice(0, 120) },
    { nombre_captura: claveEquipo(B), equipo_id: eB[0] as number, equipo_nombre: String(eB[1]).slice(0, 120) },
  ].filter((e) => e.nombre_captura)
}

// ¿Están los equipos de la captura al revés que en la API? (para recordar bien cada lado)
export function estaInvertido(evento: string, p: PartidoApi): boolean {
  const c = candidatos({ evento }, [p])[0]
  return c ? c.invertido : false
}

// "4 nov, 21:00"
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
export function textoDia(dia: string, hora?: string): string {
  const [, m, d] = dia.split('-').map(Number)
  return `${d} ${MESES[m - 1]}${hora ? `, ${hora}` : ''}`
}
