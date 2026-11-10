// Pruebas de API-Football (registro, tarea 3): emparejado de nombres español/inglés, niveles de
// coincidencia, qué se rellena (nunca pisa lo claro), ligas, caché, tope, errores de la API (429,
// red, tiempo agotado) sin bloquear, y que la clave nunca sale de la petición.
// Todo con una API SIMULADA con la forma real de las respuestas (sin internet).
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheVigente,
  candidatos,
  claveEquipo,
  decidirRelleno,
  diasAConsultar,
  emparejar,
  equiposARecordar,
  esDeFutbol,
  estaInvertido,
  ladosDelEvento,
  ligaParaPartido,
  normalizarEquipo,
  normalizarLiga,
  parecidoEquipos,
  puedeLlamar,
  type PartidoApi,
} from '../src/lib/api-futbol/emparejar.ts'
import { baseLocal, cabecerasDe, configDesdeEntorno, pedir, type ConfigApi, type FetchLike } from '../src/lib/api-futbol/cliente.ts'
import { cuotaDeCabeceras, errorDeLaRespuesta, leerEstado, leerFixtures } from '../src/lib/api-futbol/respuesta.ts'
import { partidosDeDias, type Almacen, type FilaDia, type FilaUso } from '../src/lib/api-futbol/servicio.ts'
import { consultarSelecciones, mapaRecordados, textoAviso, type Contexto } from '../src/lib/api-futbol/consulta.ts'

// ---------- datos de prueba ----------

let sig = 1000
function partido(local: string, visitante: string, extra: Partial<PartidoApi> = {}): PartidoApi {
  const id = sig++
  return {
    id,
    fecha: '2026-11-10',
    hora: '21:00',
    liga_id: 2,
    liga: 'UEFA Champions League',
    pais: 'World',
    local_id: id * 10 + 1,
    local,
    visitante_id: id * 10 + 2,
    visitante,
    estado: 'NS',
    ...extra,
  }
}

const DIA = '2026-11-10'
const jornada = (): PartidoApi[] => [
  partido('Bayern München', 'Arsenal'),
  partido('Atletico Madrid', 'Inter', { hora: '18:45' }),
  partido('Galatasaray', 'VfB Stuttgart', { liga_id: 3, liga: 'UEFA Europa League' }),
  partido('Athletic Club', 'Real Sociedad', { liga_id: 140, liga: 'La Liga', pais: 'Spain', hora: '16:15' }),
  partido('Real Madrid', 'Valencia', { liga_id: 140, liga: 'La Liga', pais: 'Spain', hora: '21:00' }),
  partido('Real Madrid Castilla', 'Valencia B', { liga_id: 435, liga: 'Primera División RFEF', pais: 'Spain', hora: '12:00' }),
  partido('Barcelona', 'Sevilla', { liga_id: 140, liga: 'La Liga', pais: 'Spain', hora: '18:30' }),
  partido('Barcelona W', 'Sevilla W', { liga_id: 142, liga: 'Liga F', pais: 'Spain', hora: '12:00' }),
  partido('Spain U21', 'Italy U21', { liga_id: 38, liga: 'Euro U21', hora: '19:00' }),
  partido('Spain', 'Italy', { liga_id: 10, liga: 'Friendlies', hora: '20:45' }),
]

const clara = (evento: string, extra: object = {}, lista = jornada()) => {
  const r = emparejar({ evento, ...extra }, lista)
  assert.equal(r.nivel, 'clara', `${evento}: ${JSON.stringify(r)}`)
  return r.nivel === 'clara' ? r.candidato : (null as never)
}

// ---------- normalización y emparejado ----------

test('normalización: sin mayúsculas, tildes, palabras vacías ni sufijos; equivalencias comunes', () => {
  assert.deepEqual(normalizarEquipo('Bayern de Múnich').palabras, ['bayern', 'munchen'])
  assert.deepEqual(normalizarEquipo('Bayern München').palabras, ['bayern', 'munchen'])
  assert.deepEqual(normalizarEquipo('Atlético de Madrid').palabras, ['atletico', 'madrid'])
  assert.deepEqual(normalizarEquipo('Galatasaray SK').palabras, ['galatasaray'])
  assert.deepEqual(normalizarEquipo('VfB Stuttgart').palabras, ['stuttgart'])
  assert.deepEqual(normalizarEquipo('Athletic Club').palabras, ['athletic'])
  assert.deepEqual(normalizarEquipo('Real Madrid Castilla'), { palabras: ['real', 'madrid'], distintivas: ['b'] })
  assert.deepEqual(normalizarEquipo('Barcelona Femenino').distintivas, ['fem'])
  assert.deepEqual(normalizarEquipo('Barcelona W').distintivas, ['fem'])
  assert.deepEqual(normalizarEquipo('España Sub-21').distintivas, ['u21'])
  assert.deepEqual(normalizarEquipo('Spain U21').distintivas, ['u21'])
  assert.equal(claveEquipo('Bayern de Múnich'), claveEquipo('BAYERN  DE MUNICH'))
})

test('partido de dos lados: guiones, "vs" y "v"; un guion dentro del nombre no parte', () => {
  assert.deepEqual(ladosDelEvento('Betis - Sevilla'), ['Betis', 'Sevilla'])
  assert.deepEqual(ladosDelEvento('Betis vs Sevilla'), ['Betis', 'Sevilla'])
  assert.deepEqual(ladosDelEvento('Betis v. Sevilla'), ['Betis', 'Sevilla'])
  assert.deepEqual(ladosDelEvento('Betis-Sevilla'), ['Betis', 'Sevilla'])
  assert.deepEqual(ladosDelEvento('Paris Saint-Germain - Lyon'), ['Paris Saint-Germain', 'Lyon'])
  assert.equal(ladosDelEvento('Sinner'), null)
  assert.equal(ladosDelEvento('Más de 2,5 goles'), null)
})

test('pares reales español/inglés: coincidencia clara', () => {
  assert.equal(clara('Bayern de Múnich - Arsenal').partido.local, 'Bayern München')
  assert.equal(clara('Atlético de Madrid - Inter de Milán').partido.local, 'Atletico Madrid')
  assert.equal(clara('Galatasaray SK - VfB Stuttgart').partido.visitante, 'VfB Stuttgart')
  assert.equal(clara('Galatasaray - Stuttgart').partido.visitante, 'VfB Stuttgart')
  assert.equal(clara('Athletic Club - Real Sociedad').partido.local, 'Athletic Club')
  assert.equal(clara('Athletic Bilbao vs Real Sociedad').partido.local, 'Athletic Club')
})

test('palabras que distinguen: Real Madrid ≠ Real Madrid Castilla; Barcelona ≠ Barcelona Femenino; selección ≠ sub-21', () => {
  assert.equal(clara('Real Madrid - Valencia').partido.local, 'Real Madrid')
  assert.equal(clara('Real Madrid Castilla - Valencia B').partido.local, 'Real Madrid Castilla')
  assert.equal(clara('Barcelona - Sevilla').partido.local, 'Barcelona')
  assert.equal(clara('Barcelona Femenino - Sevilla Femenino').partido.local, 'Barcelona W')
  assert.equal(clara('España - Italia'.replace('España', 'Spain').replace('Italia', 'Italy')).partido.liga, 'Friendlies')
  assert.equal(clara('Spain Sub-21 - Italy Sub-21').partido.liga, 'Euro U21')
  // Solo la versión filial / femenina en la jornada: NO se empareja con la absoluta.
  const soloFilial = [partido('Real Madrid Castilla', 'Getafe B'), partido('Barcelona W', 'Levante W')]
  assert.equal(emparejar({ evento: 'Real Madrid - Getafe' }, soloFilial).nivel, 'ninguna')
  assert.equal(emparejar({ evento: 'Barcelona - Levante' }, soloFilial).nivel, 'ninguna')
  assert.ok(parecidoEquipos(normalizarEquipo('Real Madrid'), normalizarEquipo('Real Madrid Castilla')) < 0.5)
})

test('equipos al revés: se encuentran (con menos puntos) y se sabe que están invertidos', () => {
  const c = clara('Arsenal - Bayern de Múnich')
  assert.equal(c.partido.local, 'Bayern München')
  assert.equal(c.invertido, true)
  assert.ok(c.puntos < clara('Bayern de Múnich - Arsenal').puntos)
})

test('varias coincidencias: hasta 3 fichas, sin ninguna elegida; ninguna: nada', () => {
  const lista = [
    partido('Universidad de Chile', 'Nacional', { hora: '22:00', liga_id: 265, liga: 'Primera División', pais: 'Chile' }),
    partido('Universidad Catolica', 'Nacional', { hora: '20:00', liga_id: 268, liga: 'Primera División', pais: 'Uruguay' }),
    partido('Universidad de Concepcion', 'Nacional', { hora: '17:00', liga_id: 266, liga: 'Primera B', pais: 'Chile' }),
    partido('Universidad Cesar Vallejo', 'Nacional', { hora: '15:00', liga_id: 281, liga: 'Liga 1', pais: 'Peru' }),
  ]
  const r = emparejar({ evento: 'Universidad - Nacional' }, lista)
  assert.equal(r.nivel, 'varias')
  assert.equal(r.nivel === 'varias' && r.candidatos.length, 3)
  assert.equal(emparejar({ evento: 'Osasuna - Mallorca' }, jornada()).nivel, 'ninguna')
  assert.equal(emparejar({ evento: 'Sinner' }, jornada()).nivel, 'ninguna')
})

test('mismo día: la hora y la liga desempatan', () => {
  const lista = [
    partido('Universidad de Chile', 'Nacional', { hora: '22:00', liga_id: 265, liga: 'Primera División', pais: 'Chile' }),
    partido('Universidad Catolica', 'Nacional', { hora: '20:00', liga_id: 268, liga: 'Primera División', pais: 'Uruguay' }),
  ]
  assert.equal(emparejar({ evento: 'Universidad - Nacional' }, lista).nivel, 'varias')
  const porHora = emparejar({ evento: 'Universidad - Nacional', hora: '20:00' }, lista)
  assert.equal(porHora.nivel === 'clara' && porHora.candidato.partido.local, 'Universidad Catolica')
  const porLiga = emparejar({ evento: 'Universidad - Nacional', ligasPosibles: new Set([265]) }, lista)
  assert.equal(porLiga.nivel === 'clara' && porLiga.candidato.partido.local, 'Universidad de Chile')
  // Una hora distinta resta: con la hora de otro partido no hay coincidencia clara con este.
  const malaHora = candidatos({ evento: 'Bayern de Múnich - Arsenal', hora: '15:00' }, jornada())[0]
  assert.ok(malaHora.puntos < clara('Bayern de Múnich - Arsenal', { hora: '21:00' }).puntos)
})

test('equivalencias recordadas: "Bayern" a secas sale a la primera para quien lo eligió', () => {
  const lista = [partido('Bayern München', 'Arsenal'), partido('Bayern II', 'Arsenal U21'), partido('Bayer Leverkusen', 'Arsenal W')]
  const bayern = lista[0]
  const recordados = mapaRecordados(equiposARecordar('Bayern - Arsenal', bayern, false))
  assert.equal(recordados.get(claveEquipo('Bayern')), bayern.local_id)
  const r = emparejar({ evento: 'Bayern - Arsenal', recordados }, lista)
  assert.equal(r.nivel === 'clara' && r.candidato.partido.id, bayern.id)
  // Recordar respeta el lado: "Arsenal - Bayern" (al revés) guarda cada nombre con su equipo.
  const rev = equiposARecordar('Arsenal - Bayern', bayern, estaInvertido('Arsenal - Bayern', bayern))
  assert.deepEqual(rev.map((e) => e.equipo_nombre), ['Arsenal', 'Bayern München'])
})

// ---------- qué se rellena ----------

const sel = (x: Partial<Record<'evento_fecha' | 'evento_hora' | 'liga' | 'deporte', string>> = {}) => ({ evento_fecha: '', evento_hora: '', liga: '', deporte: '', ...x })

test('coincidencia clara: rellena día, hora, liga y Fútbol en los campos vacíos', () => {
  const p = partido('Bayern München', 'Arsenal')
  const r = decidirRelleno(sel(), {}, p, 'Champions League', 'Fútbol')
  assert.deepEqual(r.cambios, { evento_fecha: DIA, evento_hora: '21:00', liga: 'Champions League', deporte: 'Fútbol' })
  assert.deepEqual(r.sugerencias, {})
})

test('nunca pisa lo que la captura muestra con claridad: la hora y la liga distintas son sugerencia', () => {
  const p = partido('Bayern München', 'Arsenal')
  const r = decidirRelleno(sel({ evento_fecha: DIA, evento_hora: '20:00', liga: 'Liga de Campeones', deporte: 'Fútbol' }), {}, p, 'Champions League', 'Fútbol')
  assert.deepEqual(r.cambios, {})
  assert.deepEqual(r.sugerencias, { hora: '21:00', liga: 'Champions League' })
  // Dudosas (ámbar) o deducidas de otra apuesta: la API sí las sustituye (tiene prioridad).
  const r2 = decidirRelleno(
    sel({ evento_fecha: DIA, evento_hora: '20:00', liga: 'Liga de Campeones', deporte: 'Fútbol' }),
    { evento_hora: 'borroso', liga: 'otra_apuesta' },
    p,
    'Champions League',
    'Fútbol',
  )
  assert.deepEqual(r2.cambios, { evento_hora: '21:00', liga: 'Champions League' })
})

test('día conflictivo: la captura dice otro día → sugerencia, no imposición', () => {
  const p = partido('Galatasaray', 'VfB Stuttgart', { fecha: '2026-11-04', hora: '18:45' })
  const r = decidirRelleno(sel({ evento_fecha: '2026-11-03', evento_hora: '18:45' }), {}, p, 'Europa League', 'Fútbol')
  assert.equal(r.cambios.evento_fecha, undefined)
  assert.equal(r.cambios.evento_hora, undefined, 'la hora de otro día tampoco se pone sola')
  assert.equal(r.sugerencias.dia, '2026-11-04')
  // Incluso con el día en ámbar: el día nunca se cambia solo.
  assert.equal(decidirRelleno(sel({ evento_fecha: '2026-11-03' }), { evento_fecha: 'deducido' }, p, '', 'Fútbol').cambios.evento_fecha, undefined)
})

test('solo fútbol: las selecciones de otros deportes no se consultan', () => {
  for (const d of ['', 'Fútbol', 'futbol', 'Football']) assert.ok(esDeFutbol(d), d)
  for (const d of ['Tenis', 'Baloncesto', 'Fútbol sala']) assert.ok(!esDeFutbol(d), d)
})

// ---------- ligas ----------

test('ligas: "UEFA" no cuenta; equivalencia recordada; nombre nuevo propuesto; mismo nombre en otro país', () => {
  assert.equal(normalizarLiga('UEFA Champions League'), normalizarLiga('Champions League'))
  assert.equal(normalizarLiga('La Liga'), normalizarLiga('LaLiga'))
  assert.notEqual(normalizarLiga('LaLiga Hypermotion'), normalizarLiga('LaLiga'))
  const cat = [
    { id: 'l1', nombre: 'LaLiga' },
    { id: 'l2', nombre: 'Champions League' },
    { id: 'l3', nombre: 'LaLiga Hypermotion' },
    { id: 'l4', nombre: 'Serie A' },
    { id: 'l5', nombre: 'Copa del Rey', archivada: true },
  ]
  assert.deepEqual(ligaParaPartido({ liga_id: 140, liga: 'La Liga', pais: 'Spain' }, cat, []), { nombre: 'LaLiga', enCatalogo: true, archivada: false, apiNombre: 'La Liga (España)' })
  assert.equal(ligaParaPartido({ liga_id: 2, liga: 'UEFA Champions League', pais: 'World' }, cat, []).nombre, 'Champions League')
  // "Segunda División" de la API no coincide con "LaLiga Hypermotion": se propone (o se elige una tuya)…
  const segunda = ligaParaPartido({ liga_id: 141, liga: 'Segunda División', pais: 'Spain' }, cat, [])
  assert.deepEqual([segunda.nombre, segunda.enCatalogo], ['Segunda División', false])
  // …y si eliges "LaLiga Hypermotion", se recuerda por el id de la API.
  assert.equal(ligaParaPartido({ liga_id: 141, liga: 'Segunda División', pais: 'Spain' }, cat, [{ liga_api_id: 141, liga_id: 'l3' }]).nombre, 'LaLiga Hypermotion')
  // Archivada: se reconoce (para ofrecer "Recuperar").
  assert.deepEqual(ligaParaPartido({ liga_id: 143, liga: 'Copa del Rey', pais: 'Spain' }, cat, []).archivada, true)
  // Mismo nombre en otro país: tu "Serie A" está enlazada a la de Italia (135) → la de Brasil se propone con el país.
  const eqItalia = [{ liga_api_id: 135, liga_id: 'l4' }]
  assert.equal(ligaParaPartido({ liga_id: 135, liga: 'Serie A', pais: 'Italy' }, cat, eqItalia).nombre, 'Serie A')
  assert.deepEqual(ligaParaPartido({ liga_id: 71, liga: 'Serie A', pais: 'Brazil' }, cat, eqItalia), {
    nombre: 'Serie A (Brasil)', enCatalogo: false, archivada: false, apiNombre: 'Serie A (Brasil)',
  })
  // Nombre reservado: nunca se propone tal cual.
  assert.equal(ligaParaPartido({ liga_id: 9, liga: 'Varios', pais: 'Spain' }, cat, []).nombre, 'Varios (España)')
})

// ---------- caché, días y tope ----------

test('días a consultar: el de cada selección; sin día, de hoy − 7 a hoy + 2 (10 días)', () => {
  assert.deepEqual(diasAConsultar(['2026-11-12', '2026-11-12'], DIA), ['2026-11-12'])
  const ventana = diasAConsultar([null], DIA)
  assert.equal(ventana.length, 10)
  assert.deepEqual([ventana[0], ventana.at(-1)], ['2026-11-03', '2026-11-12'])
})

test('caché: hoy y futuros valen 6 horas; un día pasado, consultado ya pasado, para siempre; incompleta, nunca', () => {
  const ahora = new Date('2026-11-10T12:00:00Z')
  assert.ok(cacheVigente({ fecha: '2026-11-10', actualizado: '2026-11-10T08:00:00Z', completo: true }, DIA, ahora), 'hit')
  assert.ok(!cacheVigente({ fecha: '2026-11-11', actualizado: '2026-11-10T05:00:00Z', completo: true }, DIA, ahora), 'caducada (7 h)')
  assert.ok(cacheVigente({ fecha: '2026-11-08', actualizado: '2026-11-09T09:00:00Z', completo: true }, DIA, ahora), 'día pasado consultado ya pasado')
  assert.ok(!cacheVigente({ fecha: '2026-11-08', actualizado: '2026-11-08T09:00:00Z', completo: true }, DIA, ahora), 'consultado antes de jugarse: se vuelve a consultar una vez')
  assert.ok(!cacheVigente({ fecha: '2026-11-10', actualizado: '2026-11-10T11:00:00Z', completo: false }, DIA, ahora), 'incompleta')
})

test('tope diario por usuario, llamadas restantes según la API y pausa tras un 429', () => {
  const ahora = new Date('2026-11-10T12:00:00Z')
  assert.deepEqual(puedeLlamar(null, 300, 50, ahora), { ok: true })
  assert.deepEqual(puedeLlamar({ llamadas: 300, restantes: 7000, pausa_hasta: null }, 300, 50, ahora), { ok: false, motivo: 'tope' })
  assert.deepEqual(puedeLlamar({ llamadas: 3, restantes: 49, pausa_hasta: null }, 300, 50, ahora), { ok: false, motivo: 'restantes' })
  assert.deepEqual(puedeLlamar({ llamadas: 3, restantes: 7000, pausa_hasta: '2026-11-10T12:03:00Z' }, 300, 50, ahora), { ok: false, motivo: 'pausa' })
  assert.deepEqual(puedeLlamar({ llamadas: 3, restantes: 7000, pausa_hasta: '2026-11-10T11:00:00Z' }, 300, 50, ahora), { ok: true })
})

// ---------- respuestas de la API (forma real) ----------

const CLAVE = 'clave-secreta-de-prueba-123456'

function fixtureReal(p: PartidoApi) {
  return {
    fixture: { id: p.id, referee: null, timezone: 'Europe/Madrid', date: `${p.fecha}T${p.hora || '00:00'}:00+01:00`, timestamp: 0, periods: {}, venue: { id: 1, name: 'X', city: 'Y' }, status: { long: 'Not Started', short: p.estado, elapsed: null } },
    league: { id: p.liga_id, name: p.liga, country: p.pais, logo: 'x', flag: null, season: 2026, round: 'Regular Season - 12' },
    teams: { home: { id: p.local_id, name: p.local, logo: 'x', winner: null }, away: { id: p.visitante_id, name: p.visitante, logo: 'x', winner: null } },
    goals: { home: null, away: null },
    score: {},
  }
}
const cuerpo = (lista: PartidoApi[], fecha: string, pagina = 1, total = 1) => ({
  get: 'fixtures',
  parameters: { date: fecha, timezone: 'Europe/Madrid' },
  errors: [],
  results: lista.length,
  paging: { current: pagina, total },
  response: lista.map(fixtureReal),
})
const cabeceras = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })

type Peticion = { url: string; headers: Record<string, string> }
// API simulada: `responder` decide qué devolver para cada petición.
function apiSimulada(responder: (url: URL, n: number) => { status?: number; body?: unknown; headers?: Record<string, string> } | 'red' | 'colgar') {
  const peticiones: Peticion[] = []
  const f: FetchLike = (url, init) => {
    peticiones.push({ url, headers: init.headers })
    const r = responder(new URL(url), peticiones.length)
    if (r === 'red') return Promise.reject(new TypeError('fetch failed'))
    if (r === 'colgar') {
      return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
    }
    return Promise.resolve({
      status: r.status ?? 200,
      headers: cabeceras({ 'x-ratelimit-requests-limit': '7500', 'x-ratelimit-requests-remaining': '7400', ...(r.headers ?? {}) }),
      json: async () => r.body,
    })
  }
  return { f, peticiones }
}

test('respuesta real: se leen los partidos con su hora de España; los de forma rara se ignoran', () => {
  const lista = jornada()
  const body = cuerpo(lista, DIA)
  body.response.push({ fixture: { id: 'roto' } } as never)
  const r = leerFixtures(body, DIA)
  assert.ok(r.ok)
  assert.equal(r.ok && r.partidos.length, lista.length)
  assert.equal(r.ok && r.ignorados, 1)
  assert.deepEqual(r.ok && r.partidos[0], lista[0])
  assert.deepEqual(leerFixtures({ nada: 1 }, DIA), { ok: false, error: 'forma' })
  // La API responde 200 con errores dentro (límite del día o clave mala).
  assert.deepEqual(leerFixtures({ errors: { requests: 'You have reached the request limit for the day' }, response: [] }, DIA), { ok: false, error: 'limite' })
  assert.deepEqual(leerFixtures({ errors: { token: 'Error/Missing application key' }, response: [] }, DIA), { ok: false, error: 'clave' })
  assert.equal(errorDeLaRespuesta([]), null)
  assert.deepEqual(cuotaDeCabeceras(cabeceras({ 'x-ratelimit-requests-remaining': '12', 'x-ratelimit-requests-limit': '7500' })), { restantes: 12, limite: 7500 })
})

test('/status: solo plan y llamadas (nunca el nombre ni el email de la cuenta)', () => {
  const r = leerEstado({
    errors: [],
    response: { account: { firstname: 'Nombre', lastname: 'Apellido', email: 'privado@ejemplo.com' }, subscription: { plan: 'Pro', end: '2027-01-01', active: true }, requests: { current: 120, limit_day: 7500 } },
  })
  assert.deepEqual(r, { ok: true, estado: { plan: 'Pro', activa: true, usadas: 120, limite: 7500 } })
  assert.ok(!JSON.stringify(r).includes('privado@'))
})

test('cabeceras: directa solo x-apisports-key; RapidAPI con su clave y su host', () => {
  assert.deepEqual(cabecerasDe({ proveedor: 'direct', clave: 'k' }), { 'x-apisports-key': 'k' })
  assert.deepEqual(cabecerasDe({ proveedor: 'rapidapi', clave: 'k' }), { 'x-rapidapi-key': 'k', 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' })
})

// ---------- servicio con caché y API simulada ----------

function almacenFalso(inicial: FilaDia[] = [], uso: FilaUso | null = null) {
  const dias = new Map(inicial.map((f) => [f.fecha, f]))
  const estado = { uso, guardados: [] as string[], borradoAntesDe: '' }
  const a: Almacen = {
    leerDias: async (fechas) => fechas.map((f) => dias.get(f)).filter((x): x is FilaDia => !!x),
    guardarDia: async (f) => {
      dias.set(f.fecha, f)
      estado.guardados.push(f.fecha)
    },
    borrarDiasAnterioresA: async (f) => {
      estado.borradoAntesDe = f
      for (const k of [...dias.keys()]) if (k < f) dias.delete(k)
    },
    leerUso: async () => estado.uso,
    guardarUso: async (u) => {
      estado.uso = u
    },
  }
  return { a, dias, estado }
}

const CONFIG: ConfigApi = { proveedor: 'direct', clave: CLAVE, timeoutMs: 200 }
function opciones(almacen: Almacen, f: FetchLike, logs: unknown[], extra: Partial<Parameters<typeof partidosDeDias>[1]> = {}) {
  return {
    config: CONFIG,
    almacen,
    fetch: f,
    log: (e: string, d: Record<string, unknown>) => logs.push([e, d]),
    ahora: new Date(),
    hoy: DIA,
    tope: 300,
    minimoRestantes: 50,
    limite: Date.now() + 3000,
    ...extra,
  }
}

test('caché: con un día fresco no se llama a la API; caducado, sí (y se guarda); día pasado ya consultado, nunca', async () => {
  const fresco: FilaDia = { fecha: DIA, partidos: jornada(), completo: true, actualizado: '2026-11-10T09:00:00Z' }
  const pasado: FilaDia = { fecha: '2026-11-01', partidos: [], completo: true, actualizado: '2026-11-05T10:00:00Z' }
  const viejo: FilaDia = { fecha: '2026-11-11', partidos: [], completo: true, actualizado: '2026-11-10T05:00:00Z' }
  const { a, estado } = almacenFalso([fresco, pasado, viejo])
  const api = apiSimulada((u) => ({ body: cuerpo([partido('A', 'B', { fecha: u.searchParams.get('date')! })], u.searchParams.get('date')!) }))
  const logs: unknown[] = []
  const r = await partidosDeDias([DIA, '2026-11-01', '2026-11-11'], opciones(a, api.f, logs, { ahora: new Date('2026-11-10T12:00:00Z') }))
  assert.equal(api.peticiones.length, 1, 'solo el caducado')
  assert.match(api.peticiones[0].url, /\/fixtures\?date=2026-11-11&timezone=Europe%2FMadrid$/)
  assert.equal(r.partidos.get(DIA)?.length, jornada().length)
  assert.deepEqual(estado.guardados, ['2026-11-11'])
  assert.equal(estado.uso?.llamadas, 1)
  assert.equal(estado.uso?.restantes, 7400)
  assert.equal(estado.borradoAntesDe, '2026-08-12', 'limpia los días de más de 90 días')
})

test('paginación: si la respuesta dice que hay más páginas se piden; si falla una, el día queda incompleto', async () => {
  const p1 = [partido('A', 'B')]
  const p2 = [partido('C', 'D')]
  const api = apiSimulada((u) => (u.searchParams.get('page') === '2' ? { body: cuerpo(p2, DIA, 2, 2) } : { body: cuerpo(p1, DIA, 1, 2) }))
  const { a, dias } = almacenFalso()
  const r = await partidosDeDias([DIA], opciones(a, api.f, []))
  assert.equal(r.partidos.get(DIA)?.length, 2)
  assert.equal(dias.get(DIA)?.completo, true)
  const api2 = apiSimulada((u) => (u.searchParams.get('page') === '2' ? { status: 500, body: {} } : { body: cuerpo(p1, DIA, 1, 2) }))
  const m = almacenFalso()
  const r2 = await partidosDeDias([DIA], opciones(m.a, api2.f, []))
  assert.equal(r2.partidos.get(DIA)?.length, 1, 'lo que llegó se usa')
  assert.equal(m.dias.get(DIA)?.completo, false, 'pero no se da por completo')
  assert.ok(!cacheVigente(m.dias.get(DIA)!, DIA, new Date()))
})

test('429, fallo de red y tiempo agotado: no bloquean (se sigue con la caché antigua o sin nada) y van al log', async () => {
  const antiguo: FilaDia = { fecha: DIA, partidos: jornada(), completo: true, actualizado: new Date(Date.now() - 9 * 3600_000).toISOString() }
  for (const caso of ['429', 'red', 'colgar'] as const) {
    const api = apiSimulada(() => (caso === '429' ? { status: 429, body: { message: 'Too many requests' }, headers: { 'retry-after': '60' } } : caso))
    const { a, estado } = almacenFalso([antiguo])
    const logs: [string, Record<string, unknown>][] = []
    const t0 = Date.now()
    const r = await partidosDeDias([DIA, '2026-11-11'], opciones(a, api.f, logs as unknown[]))
    assert.ok(Date.now() - t0 < 2000, `${caso}: no se queda esperando`)
    assert.equal(r.partidos.get(DIA)?.length, jornada().length, `${caso}: usa la caché antigua`)
    assert.equal(r.partidos.has('2026-11-11'), false)
    assert.ok(logs.some(([e]) => e === '[api-futbol:fixtures]'), `${caso}: va al log`)
    const fallo = (logs.find(([e]) => e === '[api-futbol:fixtures]') as [string, Record<string, unknown>])[1].fallo
    assert.equal(fallo, caso === '429' ? 'limite' : caso === 'red' ? 'red' : 'tiempo')
    if (caso === '429') {
      assert.equal(api.peticiones.length, 2, 'un 429 no se reintenta (una por día)')
      assert.ok(estado.uso?.pausa_hasta && Date.parse(estado.uso.pausa_hasta) > Date.now(), 'pausa tras el 429')
    } else assert.equal(api.peticiones.length, 4, `${caso}: un reintento por día`)
  }
})

test('tope diario: alcanzado, no se llama; con pocas restantes según la API, tampoco', async () => {
  const api = apiSimulada(() => ({ body: cuerpo([], DIA) }))
  const lleno = almacenFalso([], { dia: new Date().toISOString().slice(0, 10), llamadas: 300, restantes: 7000, limite_dia: 7500, pausa_hasta: null })
  const r = await partidosDeDias([DIA], opciones(lleno.a, api.f, []))
  assert.equal(api.peticiones.length, 0)
  assert.ok(r.avisos.has('tope'))
  const pocas = almacenFalso([], { dia: new Date().toISOString().slice(0, 10), llamadas: 3, restantes: 10, limite_dia: 7500, pausa_hasta: null })
  const r2 = await partidosDeDias([DIA], opciones(pocas.a, api.f, []))
  assert.equal(api.peticiones.length, 0)
  assert.ok(r2.avisos.has('restantes'))
  assert.equal(textoAviso(r2.avisos), 'Hoy ya no quedan consultas a API-Football: sigue como siempre.')
  // Si una respuesta dice que quedan pocas, se deja de consultar ese día.
  const api3 = apiSimulada(() => ({ body: cuerpo([], DIA), headers: { 'x-ratelimit-requests-remaining': '20' } }))
  const m = almacenFalso()
  await partidosDeDias([DIA, '2026-11-11', '2026-11-12'], opciones(m.a, api3.f, []))
  const otra = await partidosDeDias(['2026-11-13'], opciones(m.a, api3.f, []))
  assert.equal(api3.peticiones.length, 3)
  assert.ok(otra.avisos.has('restantes'))
})

test('la clave nunca aparece en lo que se envía al móvil ni en los logs (solo en la cabecera de la petición)', async () => {
  const logs: unknown[] = []
  const api = apiSimulada((u, n) => (n === 1 ? 'red' : n === 2 ? { status: 429, body: {} } : { body: cuerpo(jornada(), u.searchParams.get('date')!) }))
  const { a } = almacenFalso()
  const ctx: Contexto = { hoy: DIA, catalogoFutbol: [], equivalencias: [], recordados: new Map() }
  const r = await consultarSelecciones(
    [{ indice: 0, evento: 'Bayern de Múnich - Arsenal', fecha: DIA, hora: '', liga: '', deporte: 'Fútbol' }],
    ctx,
    (f) => partidosDeDias(f, opciones(a, api.f, logs)),
  )
  const alMovil = JSON.stringify({ activa: true, resultados: r.resultados, aviso: textoAviso(r.avisos) })
  assert.ok(!alMovil.includes(CLAVE), 'respuesta')
  assert.ok(!JSON.stringify(logs).includes(CLAVE), 'logs')
  assert.ok(logs.length > 0)
  for (const p of api.peticiones) {
    assert.ok(!p.url.includes(CLAVE), 'la clave no va en la dirección')
    assert.deepEqual(Object.keys(p.headers), ['x-apisports-key'], 'ninguna cabecera más')
    assert.equal(p.headers['x-apisports-key'], CLAVE)
  }
})

test('pedir: un 5xx se reintenta una vez; un 401 no; respeta el plazo total', async () => {
  const api = apiSimulada((_, n) => (n === 1 ? { status: 503, body: {} } : { body: cuerpo([], DIA) }))
  const r = await pedir(CONFIG, '/fixtures', { date: DIA }, api.f)
  assert.ok(r.ok)
  assert.equal(api.peticiones.length, 2)
  const api2 = apiSimulada(() => ({ status: 401, body: {} }))
  const r2 = await pedir(CONFIG, '/fixtures', { date: DIA }, api2.f)
  assert.deepEqual([r2.ok, !r2.ok && r2.fallo, api2.peticiones.length], [false, 'clave', 1])
  const api3 = apiSimulada(() => 'colgar')
  const t0 = Date.now()
  await pedir({ ...CONFIG, timeoutMs: 4000 }, '/fixtures', {}, api3.f, Date.now() + 500)
  assert.ok(Date.now() - t0 < 1200, 'no pasa del plazo')
})

// ---------- consulta completa ----------

test('consulta: clara, varias, ninguna y otro día (sugerencia) en una sola llamada por día', async () => {
  const dia3 = [partido('Galatasaray', 'VfB Stuttgart', { fecha: '2026-11-04', hora: '18:45', liga_id: 3, liga: 'UEFA Europa League' })]
  const porFecha: Record<string, PartidoApi[]> = {
    [DIA]: [
      ...jornada(),
      partido('Universidad de Chile', 'Nacional', { hora: '22:00' }),
      partido('Universidad Catolica', 'Nacional', { hora: '20:00' }),
    ],
    '2026-11-04': dia3,
  }
  const api = apiSimulada((u) => {
    const d = u.searchParams.get('date')!
    return { body: cuerpo(porFecha[d] ?? [], d) }
  })
  const { a } = almacenFalso()
  const ctx: Contexto = { hoy: DIA, catalogoFutbol: [{ id: 'l2', nombre: 'Champions League' }], equivalencias: [], recordados: new Map() }
  const r = await consultarSelecciones(
    [
      { indice: 0, evento: 'Bayern de Múnich - Arsenal', fecha: DIA, hora: '', liga: '', deporte: '' },
      { indice: 1, evento: 'Universidad - Nacional', fecha: DIA, hora: '', liga: '', deporte: 'Fútbol' },
      { indice: 2, evento: 'Osasuna - Mallorca', fecha: DIA, hora: '', liga: '', deporte: 'Fútbol' },
      { indice: 3, evento: 'Galatasaray SK - VfB Stuttgart', fecha: '2026-11-03', hora: '18:45', liga: '', deporte: 'Fútbol' },
      { indice: 4, evento: 'Sinner - Alcaraz', fecha: DIA, hora: '', liga: '', deporte: 'Tenis' },
    ],
    ctx,
    (f) => partidosDeDias(f, opciones(a, api.f, [])),
  )
  const [r0, r1, r2, r3] = r.resultados
  assert.equal(r.resultados.length, 4, 'el tenis no se consulta')
  assert.equal(r0.nivel === 'clara' && r0.partido.liga.nombre, 'Champions League')
  assert.equal(r1.nivel === 'varias' && r1.partidos.length, 2)
  assert.equal(r2.nivel, 'ninguna')
  assert.equal(r3.nivel === 'otro_dia' && r3.partidos[0].fecha, '2026-11-04')
  const pedidas = api.peticiones.map((p) => new URL(p.url).searchParams.get('date')).sort()
  // Osasuna (día 10) no aparece: también se miran el 9 y el 11; Galatasaray (día 3): el 2 y el 4.
  assert.deepEqual(pedidas, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', DIA, '2026-11-11'])
})

test('consulta sin clave configurada: no se llama a nada (lo decide el servidor) y sin selecciones de fútbol, tampoco', async () => {
  let llamadas = 0
  const r = await consultarSelecciones([{ indice: 0, evento: 'Sinner - Alcaraz', fecha: DIA, hora: '', liga: '', deporte: 'Tenis' }], {
    hoy: DIA, catalogoFutbol: [], equivalencias: [], recordados: new Map(),
  }, async () => {
    llamadas++
    return { partidos: new Map(), consultados: new Set(), avisos: new Set() }
  })
  assert.equal(llamadas, 0)
  assert.deepEqual(r.resultados, [])
})

test('equivalencias recordadas por usuario: lo que eligió Ana no cambia lo que ve Beto', () => {
  const lista = jornada()
  const madrid = lista.find((p) => p.local === 'Real Madrid')!
  // Ana eligió una vez "Los Blancos - Valencia" → Real Madrid - Valencia: se le recuerda.
  const deAna = mapaRecordados(equiposARecordar('Los Blancos - Valencia', madrid, false))
  const ana = emparejar({ evento: 'Los Blancos - Valencia', recordados: deAna }, lista)
  assert.equal(ana.nivel === 'clara' && ana.candidato.partido.id, madrid.id)
  // Beto (sus equivalencias, vacías): el mismo texto no le empareja nada.
  assert.equal(emparejar({ evento: 'Los Blancos - Valencia', recordados: new Map() }, lista).nivel, 'ninguna')
})

test('sin clave configurada: la función queda apagada; proveedor y dirección local solo si se piden', () => {
  assert.equal(configDesdeEntorno({}), null)
  assert.equal(configDesdeEntorno({ API_FOOTBALL_KEY: '   ' }), null)
  assert.deepEqual(configDesdeEntorno({ API_FOOTBALL_KEY: 'k' }), { proveedor: 'direct', clave: 'k', timeoutMs: 4000, base: undefined })
  assert.equal(configDesdeEntorno({ API_FOOTBALL_KEY: 'k', API_FOOTBALL_PROVIDER: 'RapidAPI' })?.proveedor, 'rapidapi')
  // La dirección alternativa (prueba local) solo puede ser localhost: la clave nunca va a otra web.
  assert.equal(baseLocal('http://localhost:54323'), 'http://localhost:54323')
  for (const malo of ['https://evil.example', 'http://localhost.evil.com:80', 'http://127.0.0.1.nip.io:80', 'http://localhost:54323/x']) assert.equal(baseLocal(malo), undefined, malo)
})

// ---------- sin fecha en la captura: búsqueda por nombres en la ventana de 10 días ----------

const ctxVacio = (): Contexto => ({ hoy: DIA, catalogoFutbol: [{ id: 'l9', nombre: 'LaLiga Hypermotion' }], equivalencias: [{ liga_api_id: 141, liga_id: 'l9' }], recordados: new Map() })
const sinFecha = (evento: string, indice = 0) => ({ indice, evento, fecha: '', hora: '', liga: '', deporte: 'Fútbol' })
function apiPorDias(porFecha: Record<string, PartidoApi[]>) {
  return apiSimulada((u) => {
    const d = u.searchParams.get('date')!
    return { body: cuerpo(porFecha[d] ?? [], d) }
  })
}

test('partido de AYER sin fecha en la captura (Las Palmas - Eldense): confirmado con su día', async () => {
  const ayer = partido('Las Palmas', 'Eldense', { fecha: '2026-11-09', hora: '18:30', liga_id: 141, liga: 'Segunda División', pais: 'Spain', estado: 'FT' })
  const api = apiPorDias({ '2026-11-09': [ayer, partido('Real Zaragoza', 'Racing Santander', { fecha: '2026-11-09', estado: 'FT' })] })
  const { a } = almacenFalso()
  const r = await consultarSelecciones([sinFecha('UD Las Palmas - CD Eldense')], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, [])))
  const [x] = r.resultados
  assert.equal(x.nivel, 'clara', JSON.stringify(x))
  assert.equal(x.nivel === 'clara' && x.partido.fecha, '2026-11-09')
  assert.equal(x.nivel === 'clara' && x.partido.hora, '18:30')
  assert.equal(x.nivel === 'clara' && x.partido.liga.nombre, 'LaLiga Hypermotion', 'liga recordada')
  // Al formulario: rellena el día que faltaba (y hora, liga y Fútbol). El marcador no se usa para nada.
  assert.deepEqual(decidirRelleno(sel(), {}, ayer, 'LaLiga Hypermotion', 'Fútbol').cambios, { evento_fecha: '2026-11-09', evento_hora: '18:30', liga: 'LaLiga Hypermotion', deporte: 'Fútbol' })
  // Primera consulta sin caché: 10 llamadas (una por día de la ventana); la segunda, ninguna para los días pasados.
  assert.equal(api.peticiones.length, 10)
  const antes = api.peticiones.length
  await consultarSelecciones([sinFecha('Las Palmas - Eldense')], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, [], { ahora: new Date('2026-11-10T12:00:00Z') })))
  const nuevas = api.peticiones.slice(antes).map((p) => new URL(p.url).searchParams.get('date'))
  assert.ok(nuevas.every((d) => d! >= DIA), `solo se repiten hoy y futuros (caché de 6 h), nunca días pasados: ${nuevas}`)
})

test('partido de hace 3 días sin fecha: confirmado', async () => {
  const p = partido('Getafe', 'Girona', { fecha: '2026-11-07', hora: '14:00', liga_id: 140, liga: 'La Liga', pais: 'Spain', estado: 'FT' })
  const api = apiPorDias({ '2026-11-07': [p] })
  const { a } = almacenFalso()
  const r = await consultarSelecciones([sinFecha('Getafe CF - Girona FC')], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, [])))
  assert.equal(r.resultados[0].nivel === 'clara' && r.resultados[0].partido.fecha, '2026-11-07')
})

test('el mismo cruce en dos días de la ventana: fichas «Partidos posibles» con su día, sin elegir', async () => {
  const liga = partido('Sevilla', 'Betis', { fecha: '2026-11-05', hora: '21:00', liga_id: 140, liga: 'La Liga', pais: 'Spain', estado: 'FT' })
  const copa = partido('Sevilla', 'Betis', { fecha: '2026-11-11', hora: '19:00', liga_id: 143, liga: 'Copa del Rey', pais: 'Spain' })
  const api = apiPorDias({ '2026-11-05': [liga], '2026-11-11': [copa] })
  const { a } = almacenFalso()
  const r = await consultarSelecciones([sinFecha('Sevilla FC - Real Betis')], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, [])))
  const [x] = r.resultados
  assert.equal(x.nivel, 'varias')
  assert.deepEqual(x.nivel === 'varias' && x.partidos.map((p) => p.fecha).sort(), ['2026-11-05', '2026-11-11'])
})

test('partido más antiguo que la ventana: no rellena nada, no da error y no consulta ese día', async () => {
  const viejo = partido('Las Palmas', 'Eldense', { fecha: '2026-10-31', estado: 'FT' })
  const api = apiPorDias({ '2026-10-31': [viejo] })
  const { a } = almacenFalso()
  const logs: unknown[] = []
  const r = await consultarSelecciones([sinFecha('Las Palmas - Eldense')], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, logs)))
  assert.equal(r.resultados[0].nivel, 'ninguna')
  assert.equal(r.avisos.size, 0, 'sin aviso de error')
  assert.equal(logs.length, 0, 'nada al log')
  assert.ok(!api.peticiones.some((p) => p.url.includes('2026-10-31')))
})

test('con fecha en la captura, todo como antes: solo ese día (y ±1 si no aparece)', async () => {
  const api = apiPorDias({ [DIA]: jornada() })
  const { a } = almacenFalso()
  await consultarSelecciones([{ indice: 0, evento: 'Bayern de Múnich - Arsenal', fecha: DIA, hora: '', liga: '', deporte: 'Fútbol' }], ctxVacio(), (f) => partidosDeDias(f, opciones(a, api.f, [])))
  assert.deepEqual(api.peticiones.map((p) => new URL(p.url).searchParams.get('date')), [DIA])
})

// ---------- Retoques del registro 2: deporte y liga ----------

test('confirmado: deporte y liga llevan la marca aunque ya coincidieran (también día y hora)', () => {
  const p = partido('Bayern München', 'Arsenal')
  const r = decidirRelleno(sel({ evento_fecha: DIA, evento_hora: '21:00', liga: 'Champions League', deporte: 'Fútbol' }), {}, p, 'Champions League', 'Fútbol')
  assert.deepEqual(r.cambios, {})
  assert.deepEqual(r.confirmados.sort(), ['deporte', 'evento_fecha', 'evento_hora', 'liga'])
  // "futbol" escrito de otra forma: se pone el nombre de tu catálogo.
  assert.equal(decidirRelleno(sel({ deporte: 'futbol' }), {}, p, 'Champions League', 'Fútbol').cambios.deporte, 'Fútbol')
})

test('liga: vacía o dudosa → la de tu catálogo; distinta y clara (la pusiste tú o se lee bien) → sugerencia, nunca se pisa', () => {
  const p = partido('Bayern München', 'Arsenal')
  assert.equal(decidirRelleno(sel({ deporte: 'Fútbol' }), {}, p, 'Champions League', 'Fútbol').cambios.liga, 'Champions League')
  assert.equal(decidirRelleno(sel({ liga: 'Bundesliga', deporte: 'Fútbol' }), { liga: 'deducido' }, p, 'Champions League', 'Fútbol').cambios.liga, 'Champions League')
  const clara = decidirRelleno(sel({ liga: 'Bundesliga', deporte: 'Fútbol' }), {}, p, 'Champions League', 'Fútbol')
  assert.equal(clara.cambios.liga, undefined)
  assert.equal(clara.sugerencias.liga, 'Champions League')
  assert.ok(!clara.confirmados.includes('liga'))
})

test('deporte distinto (la IA puso «Baloncesto») y la API tiene el partido de fútbol: todo queda como sugerencia «Usar Fútbol»', () => {
  const p = partido('Real Madrid', 'Valencia', { liga_id: 140, liga: 'La Liga', pais: 'Spain' })
  const r = decidirRelleno(sel({ evento_fecha: DIA, liga: 'Liga Endesa', deporte: 'Baloncesto' }), { deporte: 'deducido' }, p, 'LaLiga', 'Fútbol')
  assert.deepEqual(r.cambios, {}, 'no se cambia nada solo')
  assert.deepEqual(r.confirmados, [])
  assert.equal(r.sugerencias.deporte, 'Fútbol')
  // Al pulsar «Usar Fútbol» (deporte vacío y liga sustituible) se rellena todo.
  const usar = decidirRelleno(sel({ evento_fecha: DIA, liga: 'Liga Endesa', deporte: '' }), { liga: 'api', deporte: 'api' }, p, 'LaLiga', 'Fútbol')
  assert.deepEqual([usar.cambios.deporte, usar.cambios.liga, usar.cambios.evento_hora], ['Fútbol', 'LaLiga', '21:00'])
})

test('consulta: un deporte en ámbar se envía sin deporte (se consulta); el servidor sigue sin consultar deportes claros que no son fútbol', async () => {
  let pedidas = 0
  const obtener = async () => {
    pedidas++
    return { partidos: new Map([[DIA, jornada()]]), consultados: new Set<string>(), avisos: new Set<never>() }
  }
  const ctx: Contexto = { hoy: DIA, catalogoFutbol: [], equivalencias: [], recordados: new Map() }
  const tenis = await consultarSelecciones([{ indice: 0, evento: 'Real Madrid - Valencia', fecha: DIA, hora: '', liga: '', deporte: 'Tenis' }], ctx, obtener)
  assert.deepEqual([tenis.resultados.length, pedidas], [0, 0])
  const dudoso = await consultarSelecciones([{ indice: 0, evento: 'Real Madrid - Valencia', fecha: DIA, hora: '', liga: '', deporte: '' }], ctx, obtener)
  assert.equal(dudoso.resultados[0].nivel, 'clara')
})
