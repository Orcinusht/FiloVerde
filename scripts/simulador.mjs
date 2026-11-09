import { createHash } from 'node:crypto'
// Simulador LOCAL de Supabase (Auth + base de datos + Storage) y de la API de Claude,
// para probar la app entera sin internet y sin tocar los datos reales.
//
//   * Base de datos: PGlite (Postgres en memoria) con las migraciones REALES y RLS.
//     Cada petición se ejecuta con el rol y el usuario del token, como en Supabase.
//   * Auth: tokens firmados aquí (HS256). Usuarios de prueba: Ana y Beto.
//   * Storage: el permiso se comprueba con la tabla storage.objects (RLS real);
//     los bytes se guardan en memoria.
//   * Claude: responde con transcripciones de ejemplo. Lo que contesta se elige con
//     POST http://localhost:54322/__cola  ["combinada", "resuelta", ...]
//
// Uso:  node scripts/simulador.mjs   (Supabase en :54321, Claude en :54322)
// Lo usa scripts/probar-local.mjs. No es parte de la app publicada.

import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const ROOT = join(import.meta.dirname, '..')
export const SECRETO = 'secreto-solo-local'
export const USUARIOS = {
  ana: { id: '00000000-0000-4000-8000-00000000000a', email: 'ana@prueba.local' },
  beto: { id: '00000000-0000-4000-8000-00000000000b', email: 'beto@prueba.local' },
  // Carla: cuenta con más de 1000 apuestas para probar la copia de seguridad en CSV.
  carla: { id: '00000000-0000-4000-8000-00000000000c', email: 'carla@prueba.local' },
}

// ---------- tokens ----------

const b64url = (s) => Buffer.from(s).toString('base64url')
export function firmarToken(usuario) {
  const ahora = Math.floor(Date.now() / 1000)
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const carga = b64url(
    JSON.stringify({ sub: usuario.id, email: usuario.email, role: 'authenticated', aud: 'authenticated', iat: ahora, exp: ahora + 86400 }),
  )
  const firma = createHmac('sha256', SECRETO).update(`${cab}.${carga}`).digest('base64url')
  return `${cab}.${carga}.${firma}`
}
function leerToken(req) {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  const [cab, carga, firma] = t.split('.')
  if (!firma) return null
  if (createHmac('sha256', SECRETO).update(`${cab}.${carga}`).digest('base64url') !== firma) return null
  const c = JSON.parse(Buffer.from(carga, 'base64url').toString())
  return c.exp > Date.now() / 1000 ? c : null
}

// ---------- base de datos ----------

// Fechas (date) y horas (time) como texto, igual que las devuelve Supabase.
const db = new PGlite({ parsers: { 1082: (v) => v, 1083: (v) => v } })
await db.exec(readFileSync(join(ROOT, 'tests/supabase-stub.sql'), 'utf8'))
for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
}
for (const u of Object.values(USUARIOS)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, u.email])

async function comoUsuario(claims, fn) {
  return db.transaction(async (tx) => {
    if (claims) {
      await tx.query(`set local role authenticated`)
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    } else await tx.query(`set local role anon`)
    return fn(tx)
  })
}

const ID = /^[a-z_][a-z0-9_]*$/
const ident = (s) => {
  if (!ID.test(s)) throw Object.assign(new Error(`columna no válida: ${s}`), { code: 'PGRST100' })
  return `"${s}"`
}

// Relaciones que usa la app (PostgREST las deduce de las claves foráneas).
const RELACIONES = {
  'apuestas.casas_apuestas': { tipo: 'uno', local: 'casa_id', remota: 'id' },
  'apuestas.selecciones': { tipo: 'muchos', local: 'id', remota: 'apuesta_id' },
}

function partirSelect(sel = '*') {
  const partes = []
  let nivel = 0
  let actual = ''
  for (const ch of sel) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      partes.push(actual.trim())
      actual = ''
    } else actual += ch
  }
  if (actual.trim()) partes.push(actual.trim())
  const columnas = []
  const embebidos = []
  for (const p of partes) {
    const m = /^(\w+)\((.*)\)$/.exec(p)
    if (m) embebidos.push({ tabla: m[1], columnas: m[2] })
    else columnas.push(p)
  }
  return { columnas, embebidos }
}

function condiciones(params, valores) {
  const where = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
    const [op, ...resto] = v.split('.')
    const val = resto.join('.')
    const col = ident(k)
    if (op === 'eq') where.push(`${col} = $${valores.push(val)}`)
    else if (op === 'gte') where.push(`${col} >= $${valores.push(val)}`)
    else if (op === 'ilike') where.push(`${col} ilike $${valores.push(val.replace(/\*/g, '%'))}`)
    else if (op === 'gt') where.push(`${col} > $${valores.push(val)}`)
    else if (op === 'lt') where.push(`${col} < $${valores.push(val)}`)
    else if (op === 'is' && val === 'null') where.push(`${col} is null`)
    else if (op === 'not' && val === 'is.null') where.push(`${col} is not null`)
    else if (op === 'in') {
      const lista = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).filter(Boolean)
      where.push(lista.length ? `${col}::text = any($${valores.push(lista)})` : 'false')
    }
    else throw Object.assign(new Error(`filtro no soportado: ${k}=${v}`), { code: 'PGRST100' })
  }
  return where.length ? `where ${where.join(' and ')}` : ''
}

async function embeber(tx, tabla, filas, embebidos) {
  for (const e of embebidos) {
    const rel = RELACIONES[`${tabla}.${e.tabla}`]
    if (!rel) throw new Error(`relación no soportada: ${tabla}.${e.tabla}`)
    const cols = [...new Set([...e.columnas.split(',').map((c) => c.trim()), rel.remota])].map(ident).join(', ')
    for (const f of filas) {
      const { rows } = await tx.query(`select ${cols} from public.${ident(e.tabla)} where ${ident(rel.remota)} = $1`, [
        f[rel.local],
      ])
      f[e.tabla] = rel.tipo === 'uno' ? (rows[0] ?? null) : rows
    }
  }
}

// Objetos → JSON (columnas jsonb); listas de números → arrays de Postgres.
function aParametro(v) {
  if (v !== null && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => typeof x === 'number'))) return JSON.stringify(v)
  return v
}

async function rest(req, res, url, cuerpo) {
  const claims = leerToken(req)
  const partes = url.pathname.replace('/rest/v1/', '').split('/')
  const prefer = req.headers.prefer ?? ''
  const unObjeto = (req.headers.accept ?? '').includes('vnd.pgrst.object')

  const resultado = await comoUsuario(claims, async (tx) => {
    if (partes[0] === 'apuestas' && req.method === 'GET' && url.searchParams.has('importe') && fallosDuplicadas > 0) {
      fallosDuplicadas--
      throw Object.assign(new Error('Fallo simulado al buscar duplicadas'), { code: 'XX000' })
    }
    if (partes[0] === 'rpc' && fallosGuardado > 0) {
      fallosGuardado--
      throw Object.assign(new Error('Fallo simulado al guardar'), { code: 'XX000' })
    }
    if (partes[0] === 'rpc') {
      const args = JSON.parse(cuerpo || '{}')
      const nombres = Object.keys(args)
      const valores = nombres.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))
      const lista = nombres.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')
      // Como PostgREST: una función que devuelve FILAS (returns table / setof) responde con la
      // lista de filas; una que devuelve un valor, con ese valor.
      const { rows: f } = await tx.query(`select bool_or(proretset) as filas from pg_proc where proname = $1`, [partes[1]])
      if (f[0]?.filas) {
        const { rows } = await tx.query(`select * from public.${ident(partes[1])}(${lista})`, valores)
        return { cuerpo: rows }
      }
      const { rows } = await tx.query(`select public.${ident(partes[1])}(${lista}) as r`, valores)
      return { cuerpo: rows[0].r }
    }

    const tabla = ident(partes[0])
    const { columnas, embebidos } = partirSelect(url.searchParams.get('select') ?? '*')
    const nombreTabla = partes[0]
    const relLocales = embebidos.map((e) => RELACIONES[`${nombreTabla}.${e.tabla}`]?.local).filter(Boolean)
    const cols = columnas.includes('*') ? '*' : [...new Set([...columnas, ...relLocales])].map(ident).join(', ')
    const valores = []

    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = condiciones(url.searchParams, valores)
      const orden = url.searchParams.get('order')
      const orderBy = orden
        ? `order by ${orden
            .split(',')
            .map((o) => {
              const [c, dir] = o.split('.')
              return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}`
            })
            .join(', ')}`
        : ''
      // Como Supabase (max-rows): nunca más de 1000 filas por consulta.
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      let total
      if (prefer.includes('count=exact')) {
        total = (await tx.query(`select count(*)::int n from public.${tabla} ${where}`, valores)).rows[0].n
      }
      const { rows } = await tx.query(
        `select ${cols} from public.${tabla} ${where} ${orderBy} limit ${limit} offset ${offset}`,
        valores,
      )
      await embeber(tx, nombreTabla, rows, embebidos)
      for (const r of rows) for (const c of relLocales) if (!columnas.includes(c) && !columnas.includes('*')) delete r[c]
      return { cuerpo: rows, total, offset }
    }

    if (req.method === 'POST') {
      const datos = JSON.parse(cuerpo)
      const lista = Array.isArray(datos) ? datos : [datos]
      const salida = []
      for (const fila of lista) {
        const ks = Object.keys(fila)
        const { rows } = await tx.query(
          `insert into public.${tabla} (${ks.map(ident).join(', ')}) values (${ks.map((_, i) => `$${i + 1}`).join(', ')}) returning ${cols}`,
          ks.map((k) => aParametro(fila[k])),
        )
        salida.push(...rows)
      }
      return { cuerpo: prefer.includes('return=representation') ? salida : null }
    }

    if (req.method === 'PATCH') {
      const datos = JSON.parse(cuerpo)
      const ks = Object.keys(datos)
      const sets = ks.map((k) => `${ident(k)} = $${valores.push(aParametro(datos[k]))}`).join(', ')
      const where = condiciones(url.searchParams, valores)
      const { rows } = await tx.query(`update public.${tabla} set ${sets} ${where} returning ${cols}`, valores)
      return { cuerpo: prefer.includes('return=representation') ? rows : null }
    }

    if (req.method === 'DELETE') {
      const where = condiciones(url.searchParams, valores)
      const { rows } = await tx.query(`delete from public.${tabla} ${where} returning ${cols}`, valores)
      return { cuerpo: prefer.includes('return=representation') ? rows : null }
    }
    throw new Error(`método no soportado ${req.method}`)
  })

  let { cuerpo: salida } = resultado
  const cabeceras = { 'Content-Type': 'application/json' }
  if (resultado.total != null) {
    const n = Array.isArray(salida) ? salida.length : 0
    cabeceras['Content-Range'] = `${resultado.offset}-${resultado.offset + Math.max(n, 1) - 1}/${resultado.total}`
  }
  if (unObjeto && Array.isArray(salida)) {
    if (salida.length !== 1) {
      res.writeHead(406, cabeceras)
      return res.end(JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${salida.length} rows` }))
    }
    salida = salida[0]
  }
  if (salida === null || req.method === 'HEAD') {
    res.writeHead(req.method === 'HEAD' ? 200 : 201, cabeceras)
    return res.end()
  }
  res.writeHead(req.method === 'POST' && partes[0] !== 'rpc' ? 201 : 200, cabeceras)
  res.end(JSON.stringify(salida))
}

// ---------- storage ----------

const archivos = new Map()
let fallosBorrado = 0 // para simular que el borrado de imágenes falla
let fallosGuardado = 0 // para simular que guardar una apuesta falla
let fallosDuplicadas = 0 // para simular que la búsqueda de duplicadas falla

async function storage(req, res, url, cuerpoBuf) {
  const claims = leerToken(req)
  const resto = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''))
  const [bucket, ...trozos] = resto.split('/')
  const nombre = trozos.join('/')

  // Listado de una carpeta (supabase.storage.from(b).list(carpeta)).
  if (req.method === 'POST' && bucket === 'list') {
    const { prefix = '', limit = 100, offset = 0 } = JSON.parse(cuerpoBuf.toString() || '{}')
    const b = trozos[0]
    const { rows } = await comoUsuario(claims, (tx) =>
      tx.query(`select name, created_at from storage.objects where bucket_id = $1 and name like $2 order by name limit $3 offset $4`, [
        b, `${prefix.replace(/\/$/, '')}/%`, limit, offset,
      ]),
    )
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(
      JSON.stringify(
        rows.map((r) => ({
          name: r.name.slice(prefix.replace(/\/$/, '').length + 1),
          id: r.name,
          created_at: r.created_at,
          metadata: { size: archivos.get(`${b}/${r.name}`)?.bytes.length ?? 0 },
        })),
      ),
    )
  }
  if (req.method === 'POST' && nombre) {
    await comoUsuario(claims, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, nombre]))
    archivos.set(`${bucket}/${nombre}`, { bytes: cuerpoBuf, tipo: req.headers['content-type'] })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ Key: `${bucket}/${nombre}`, Id: nombre }))
  }
  if (req.method === 'GET') {
    const { rows } = await comoUsuario(claims, (tx) =>
      tx.query(`select name from storage.objects where bucket_id = $1 and name = $2`, [bucket, nombre]),
    )
    const a = archivos.get(`${bucket}/${nombre}`)
    if (!rows.length || !a) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }))
    }
    res.writeHead(200, { 'Content-Type': a.tipo })
    return res.end(a.bytes)
  }
  if (req.method === 'DELETE') {
    if (fallosBorrado > 0) {
      fallosBorrado--
      res.writeHead(500, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ statusCode: '500', error: 'internal', message: 'Fallo simulado' }))
    }
    const { prefixes } = JSON.parse(cuerpoBuf.toString() || '{}')
    const { rows } = await comoUsuario(claims, (tx) =>
      tx.query(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [bucket, prefixes]),
    )
    for (const r of rows) archivos.delete(`${bucket}/${r.name}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(rows.map((r) => ({ name: r.name, bucket_id: bucket }))))
  }
  res.writeHead(404).end()
}

// ---------- servidor Supabase ----------

function leerCuerpo(req) {
  return new Promise((ok) => {
    const trozos = []
    req.on('data', (c) => trozos.push(c))
    req.on('end', () => ok(Buffer.concat(trozos)))
  })
}

export const peticiones = []

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const cuerpo = await leerCuerpo(req)
  peticiones.push(`${req.method} ${url.pathname}`)
  try {
    if (url.pathname === '/auth/v1/user') {
      const c = leerToken(req)
      if (!c) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ code: 'bad_jwt', message: 'invalid JWT' }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }))
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return res.writeHead(204).end()
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, cuerpo.toString())
    if (url.pathname.startsWith('/storage/v1/object/')) return await storage(req, res, url, cuerpo)
    res.writeHead(404).end()
  } catch (e) {
    const codigo = e.code ?? 'XX000'
    const estado = codigo === '42501' ? 403 : codigo === '23505' ? 409 : 400
    res.writeHead(estado, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code: codigo, message: e.message, details: null, hint: null, statusCode: String(estado) }))
  }
}).listen(54321)

// ---------- servidor Claude (simulado) ----------

const sel = (evento, pronostico, cuota, extra = {}) => ({
  evento, liga: 'LaLiga', deporte: 'Fútbol', mercado: '1X2', pronostico, cuota, estado: null,
  evento_fecha: '2026-11-08', evento_hora: '21:00', sustituto: null, ...extra,
})
const apuesta = (extra) => ({
  casa: 'Bet365', tipo: 'simple', fecha: null, importe: 10, cuota_total: '1.85', ganancia_potencial: 18.5,
  estado: null, importe_cobrado: null, selecciones: [], dudosos: [], incompleta: false, casa_distinta: false,
  promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null, ...extra,
})
const con = (...apuestas) => ({ hay_apuestas: true, motivo: null, apuestas })
const APUESTAS = {
  simple: apuesta({
    fecha: '2026-10-31T20:45',
    selecciones: [sel('Real Betis - Sevilla FC', 'Real Betis', '1.85')],
  }),
  combinada: apuesta({
    casa: 'Codere', tipo: 'combinada', fecha: '2026-11-01T16:00', importe: 5, cuota_total: '+450', ganancia_potencial: 27.5,
    selecciones: [
      sel('Valencia - Villarreal', 'Empate', '6/4', { evento_hora: null }),
      sel('Athletic - Osasuna', 'Athletic', '2.00', { mercado: null, liga: 'LaLiga' }),
    ],
    dudosos: [
      { campo: 'selecciones.1.mercado', motivo: 'no_visible' },
      { campo: 'selecciones.1.liga', motivo: 'deducido' },
    ],
  }),
  resuelta: apuesta({
    fecha: '2026-10-25T18:30', importe: 20, cuota_total: '2.10', ganancia_potencial: 42, estado: 'ganada', importe_cobrado: 42,
    selecciones: [sel('Getafe - Girona', 'Girona', '2.10', { estado: 'ganada', evento_fecha: '2026-10-25', evento_hora: '18:30' })],
  }),
  mismo_partido: apuesta({
    tipo: 'mismo_partido', importe: 10, cuota_total: '5.50', ganancia_potencial: 55,
    selecciones: [
      sel('Real Madrid - FC Barcelona', null, null, { mercado: 'Resultado final', pronostico: 'Real Madrid' }),
      sel('Real Madrid - FC Barcelona', null, null, { mercado: 'Ambos equipos marcan', pronostico: 'Sí' }),
      sel('Real Madrid - FC Barcelona', null, null, { mercado: 'Tarjetas', pronostico: 'Más de 4.5' }),
    ],
  }),
}
APUESTAS.deducido = apuesta({
  casa: 'Bet365', importe: 10, cuota_total: '1.60', ganancia_potencial: 16,
  selecciones: [sel('Alcaraz - Sinner', 'Alcaraz', '1.60', { deporte: 'Tenis', liga: 'ATP', mercado: 'Ganador del partido' })],
  dudosos: [
    { campo: 'selecciones.0.deporte', motivo: 'deducido' },
    { campo: 'selecciones.0.liga', motivo: 'deducido' },
  ],
})
APUESTAS.dos_deportes = apuesta({
  tipo: 'combinada', importe: 5, cuota_total: '3.00', ganancia_potencial: 15,
  selecciones: [
    sel('Alcaraz - Sinner', 'Alcaraz', '1.50', { deporte: 'Tenis', liga: 'ATP', mercado: 'Ganador del partido' }),
    sel('Real Betis - Sevilla FC', 'Real Betis', '2.00'),
  ],
})
APUESTAS.liga_nueva = apuesta({
  selecciones: [sel('Benfica - Oporto', 'Benfica', '1.85', { liga: 'Liga Portugal' })],
})
// Captura hecha con el partido EN JUEGO (marcador y minuto en pantalla): la IA no lo anota.
APUESTAS.en_juego = apuesta({
  importe: 8, cuota_total: '2.40', ganancia_potencial: 19.2,
  selecciones: [sel('Girona - Villarreal', 'Girona', '2.40', { evento_fecha: '2026-11-04', evento_hora: '18:30' })],
})
APUESTAS.en_juego_resuelta = apuesta({
  importe: 6, cuota_total: '1.50', ganancia_potencial: 9, estado: 'ganada', importe_cobrado: 9,
  selecciones: [sel('Osasuna - Getafe', 'Osasuna', '1.50', { estado: 'ganada', evento_fecha: '2026-11-04', evento_hora: '16:15' })],
})
// Para las pruebas de duplicadas: una apuesta que no se parece a ninguna otra.
APUESTAS.unica = apuesta({
  casa: null, importe: 7, cuota_total: '2.20', ganancia_potencial: 15.4,
  selecciones: [sel('Rayo Vallecano - RCD Mallorca', 'Rayo Vallecano', '2.20')],
})
// Promociones: la IA solo LEE (tipo, cuota original, aumento, crédito); nunca calcula.
const promoBase = (evento, extra) =>
  apuesta({ casa: null, importe: 10, cuota_total: '2.50', ganancia_potencial: 25, selecciones: [sel(evento, evento.split(' - ')[0], '2.50')], ...extra })
APUESTAS.sup_original = promoBase('Celta - Alavés', { promo_tipo: 'superaumento', promo_cuota_original: '2.00' })
APUESTAS.sup_aumento = promoBase('Girona - Elche', { promo_tipo: 'superaumento', promo_aumento: 5 })
APUESTAS.sup_nada = promoBase('Levante - Oviedo', { promo_tipo: 'superaumento' })
APUESTAS.sup_incoherente = promoBase('Espanyol - Valencia', { promo_tipo: 'superaumento', promo_cuota_original: '2.00', promo_aumento: 6 })
APUESTAS.aumento = apuesta({
  casa: null, importe: 10, cuota_total: '2.00', ganancia_potencial: 22, promo_tipo: 'aumento', promo_cuota_original: '1.80',
  selecciones: [sel('Sevilla FC - Villarreal', 'Sevilla FC', '2.00')],
})
APUESTAS.asegurada = apuesta({
  casa: null, importe: 10, cuota_total: '3.00', ganancia_potencial: 30, promo_tipo: 'asegurada',
  selecciones: [sel('Athletic - Real Sociedad', 'Athletic', '3.00')],
})
APUESTAS.asegurada_tope = apuesta({ ...APUESTAS.asegurada, promo_credito: 5, selecciones: [sel('Mallorca - Getafe', 'Mallorca', '3.00')] })
APUESTAS.credito = apuesta({
  casa: null, importe: 10, cuota_total: '2.00', ganancia_potencial: 10, promo_tipo: 'credito',
  selecciones: [sel('Real Madrid - Atlético', 'Real Madrid', '2.00')],
})
APUESTAS.hora_rara = apuesta({
  casa: null, importe: 4, cuota_total: '1.70', ganancia_potencial: 6.8, fecha: '2026-11-01T09:07',
  selecciones: [sel('Alavés - Osasuna', 'Alavés', '1.70', { evento_hora: '14:32' })],
})
// Capturas reales de bet365 (casos de prueba de la v6): apuestas cortadas arriba y abajo.
const cortada = (extra = {}) => apuesta({ casa: 'Bet365', importe: null, cuota_total: null, ganancia_potencial: null, incompleta: true, selecciones: [], ...extra })
const selJugador = (pronostico, cuota, mercado, extra = {}) => ({
  evento: null, liga: null, deporte: 'Fútbol', mercado, pronostico, cuota, estado: null, evento_fecha_texto: null, sustituto: null, ...extra,
})
APUESTAS.gueye = apuesta({
  casa: 'Bet365', importe: 10, cuota_total: '1.57', ganancia_potencial: 15.72, estado: 'ganada', importe_cobrado: 15.72,
  selecciones: [selJugador('Pape Gueye - Más de 0.5', '1.57', 'Jugador - Remates', { evento: 'Villarreal - PSG', estado: 'ganada' })],
})
APUESTAS.yilmaz = apuesta({
  casa: 'Bet365', importe: 10, cuota_total: '1.83', ganancia_potencial: 18.3, estado: 'perdida', importe_cobrado: 0,
  selecciones: [selJugador('Baris Yilmaz - Más de 0.5', '1.83', 'Jugador - Remates a puerta', { evento: 'Galatasaray SK - VfB Stuttgart', estado: 'perdida', sustituto: 'Rafael Leao' })],
})
APUESTAS.osimhen = apuesta({
  casa: 'Bet365', importe: 10, cuota_total: '2.20', ganancia_potencial: null, estado: 'perdida', importe_cobrado: 0,
  promo_tipo: 'superaumento', promo_cuota_original: '1.66',
  selecciones: [selJugador('Victor Osimhen', '2.20', 'Anotará en cualquier momento', { estado: 'perdida' })],
})
APUESTAS.granada = apuesta({
  casa: 'Bet365', importe: 30, cuota_total: '1.72', ganancia_potencial: 51.81,
  selecciones: [selJugador('Granada', '1.72', 'Resultado final', { evento: 'Granada - Tenerife', evento_fecha_texto: 'Dom 8 nov / 17:00' })],
})
APUESTAS.fechas = apuesta({
  casa: null, tipo: 'combinada', importe: 2, cuota_total: '20.00', ganancia_potencial: 40,
  selecciones: [
    selJugador('Local', '1.50', '1X2', { evento: 'Fecha - Hoy', evento_fecha_texto: 'Hoy 21:00' }),
    selJugador('Local', '1.60', '1X2', { evento: 'Fecha - Mañana', evento_fecha_texto: 'Mañana 18:30' }),
    selJugador('Local', '1.70', '1X2', { evento: 'Fecha - Numérica', evento_fecha_texto: '08/11 21:00' }),
    selJugador('Local', '1.80', '1X2', { evento: 'Fecha - 12 h', evento_fecha_texto: 'Sáb 15 nov, 9:00 PM' }),
    selJugador('Local', '1.90', '1X2', { evento: 'Fecha - Solo hora', evento_fecha_texto: '21:00' }),
  ],
})
// Partidos conocidos (registro): fechas relativas a hoy (hora de España) para la regla de 30 días.
const diaMas = (n) => {
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
  const [y, m, d] = hoy.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export const DIA_PARTIDO = diaMas(3)
const sinPartido = { evento_fecha: null, evento_hora: null, liga: null, deporte: null }
// 1) Un partido con día y hora (madrugada: 00:30) → fecha de la apuesta = ese día.
APUESTAS.partido_base = apuesta({ importe: 7, cuota_total: '1.70', ganancia_potencial: 11.9, selecciones: [sel('Elche - Levante', 'Elche', '1.70', { evento_fecha: DIA_PARTIDO, evento_hora: '00:30' })] })
// 2) El mismo partido escrito distinto y sin día, hora, liga ni deporte.
APUESTAS.partido_conocido = apuesta({ importe: 9, cuota_total: '3.10', ganancia_potencial: 27.9, selecciones: [sel('elche vs levante', 'Empate', '3.10', sinPartido)] })
// 3) Tanda: la 1.ª trae el partido completo; la 2.ª, el mismo sin datos.
APUESTAS.tanda_1 = apuesta({ importe: 4, cuota_total: '2.20', ganancia_potencial: 8.8, selecciones: [sel('Leganés - Tenerife', 'Leganés', '2.20', { evento_fecha: diaMas(5), evento_hora: '18:15' })] })
APUESTAS.tanda_2 = apuesta({ importe: 6, cuota_total: '3.30', ganancia_potencial: 19.8, selecciones: [sel('Leganes - Tenerife', 'Empate', '3.30', sinPartido)] })
// Casa de la tanda (v7): la IA ve con claridad OTRA casa (Codere) · la ve pero duda · no ve ninguna.
APUESTAS.casa_otra = apuesta({ casa: 'Codere', casa_distinta: true, importe: 11, cuota_total: '1.95', ganancia_potencial: 21.45, selecciones: [sel('Mallorca - Alavés', 'Mallorca', '1.95')] })
APUESTAS.casa_duda = apuesta({ casa: 'Codere', casa_distinta: false, importe: 12, cuota_total: '2.05', ganancia_potencial: 24.6, selecciones: [sel('Valladolid - Eibar', 'Eibar', '2.05')], dudosos: [{ campo: 'casa', motivo: 'borroso' }] })
APUESTAS.casa_nueva = apuesta({ casa: 'Kirolbet', casa_distinta: true, importe: 13, cuota_total: '2.15', ganancia_potencial: 27.95, selecciones: [sel('Huesca - Zaragoza', 'Huesca', '2.15')] })
APUESTAS.sin_casa = apuesta({ casa: null, importe: 14, cuota_total: '2.25', ganancia_potencial: 31.5, selecciones: [sel('Racing - Sporting', 'Racing', '2.25')], dudosos: [{ campo: 'casa', motivo: 'no_visible' }] })
const RESPUESTAS = {
  casa_otra: con(APUESTAS.casa_otra),
  casa_duda: con(APUESTAS.casa_duda),
  casa_nueva: con(APUESTAS.casa_nueva),
  sin_casa: con(APUESTAS.sin_casa),
  partido_base: con(APUESTAS.partido_base),
  partido_conocido: con(APUESTAS.partido_conocido),
  tanda_1: con(APUESTAS.tanda_1),
  tanda_2: con(APUESTAS.tanda_2),
  bet365_1: con(cortada(), APUESTAS.gueye, cortada({ tipo: 'mismo_partido', importe: 4.89, selecciones: [selJugador('Resultado final: Inter de', null, 'Crear apuesta')] })),
  bet365_2: con(
    cortada(),
    cortada({ tipo: 'mismo_partido', importe: 15, selecciones: [selJugador('Villa…', null, 'Crear apuesta')] }),
    APUESTAS.yilmaz,
    APUESTAS.osimhen,
  ),
  bet365_3: con(APUESTAS.granada),
  fechas: con(APUESTAS.fechas),
  sup_original: con(APUESTAS.sup_original),
  sup_aumento: con(APUESTAS.sup_aumento),
  sup_nada: con(APUESTAS.sup_nada),
  sup_incoherente: con(APUESTAS.sup_incoherente),
  aumento: con(APUESTAS.aumento),
  asegurada: con(APUESTAS.asegurada),
  asegurada_tope: con(APUESTAS.asegurada_tope),
  credito: con(APUESTAS.credito),
  hora_rara: con(APUESTAS.hora_rara),
  unica: con(APUESTAS.unica),
  en_juego: con(APUESTAS.en_juego),
  en_juego_resuelta: con(APUESTAS.en_juego_resuelta),
  deducido: con(APUESTAS.deducido),
  dos_deportes: con(APUESTAS.dos_deportes),
  liga_nueva: con(APUESTAS.liga_nueva),
  simple: con(APUESTAS.simple),
  combinada: con(APUESTAS.combinada),
  resuelta: con(APUESTAS.resuelta),
  mismo_partido: con(APUESTAS.mismo_partido),
  dos_iguales: con(APUESTAS.unica, APUESTAS.unica),
  dos_apuestas: con(APUESTAS.simple, apuesta({ ...APUESTAS.resuelta, casa: 'Bet365' })),
  no_apuesta: { hay_apuestas: false, motivo: 'Es una foto de un perro, no un resguardo de apuesta.', apuestas: [] },
}
// v6: la IA copia la fecha del evento como texto. Las respuestas de prueba antiguas (con
// evento_fecha / evento_hora) se convierten al texto equivalente.
for (const r of Object.values(RESPUESTAS)) {
  for (const a of r.apuestas ?? []) {
    a.incompleta ??= false
    a.casa_distinta ??= false
    a.selecciones = a.selecciones.map(({ evento_fecha, evento_hora, ...s }) =>
      'evento_fecha_texto' in s ? s : { ...s, evento_fecha_texto: [evento_fecha, evento_fecha ? evento_hora : null].filter(Boolean).join(' ') || null },
    )
  }
}
let cola = []
let cacheCaliente = 0
export const llamadasIA = []

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const cuerpo = (await leerCuerpo(req)).toString()
  if (url.pathname === '/__cola') {
    cola = JSON.parse(cuerpo)
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__conducta') {
    // Solo para las pruebas locales: lo que hay guardado (como administrador).
    const { rows } = await db.query(
      `select a.id, a.estado, a.en_directo, a.viendo_partido, a.precipitada, a.recuperar_perdidas, a.precipitada_momento,
              (select evento from selecciones s where s.apuesta_id = a.id order by orden limit 1) as evento
       from apuestas a order by a.created_at`,
    )
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(rows))
  }
  if (url.pathname === '/__fallar_duplicadas') {
    fallosDuplicadas = Number(cuerpo || 1)
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__fallar_guardado') {
    fallosGuardado = Number(cuerpo || 1)
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__fallar_borrado') {
    fallosBorrado = Number(cuerpo || 1)
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__sql') {
    // Solo para las pruebas locales (como administrador): consultas de control.
    const { rows } = await db.query(cuerpo)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(rows))
  }
  if (url.pathname === '/__archivo_suelto') {
    // Crea una imagen "antigua" en Storage (sin enlace o enlazada a una apuesta, como antes).
    const { ruta, apuestaEvento } = JSON.parse(cuerpo)
    await db.query(`insert into storage.objects (bucket_id, name, created_at) values ('capturas', $1, now() - interval '3 days')`, [ruta])
    archivos.set(`capturas/${ruta}`, { bytes: Buffer.alloc(150_000), tipo: 'image/jpeg' })
    if (apuestaEvento) {
      await db.query(
        `update apuestas set imagen_origen = $1 where id = (select apuesta_id from selecciones where evento = $2 order by created_at desc limit 1)`,
        [ruta, apuestaEvento],
      )
    }
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__archivos') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify([...archivos.keys()]))
  }
  if (url.pathname === '/__llamadas') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(llamadasIA))
  }
  if (url.pathname.startsWith('/v1/messages')) {
    const b = JSON.parse(cuerpo)
    const contenido = b.messages?.[0]?.content ?? []
    const img = contenido.find((c) => c.type === 'image')
    const sistema = Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system ?? '')
    const conCache = Array.isArray(b.system) && b.system.some((x) => x.cache_control)
    llamadasIA.push({
      t: Date.now(),
      instruccionSustituto: sistema.includes('NUNCA pongas al sustituto en "pronostico"'),
      cacheSistema: conCache,
      // Huella de la parte cacheada (instrucciones + catálogo): si cambia entre lecturas, la caché se rompe.
      prefijo: createHash('sha1').update(sistema + JSON.stringify(contenido.find((c) => c.type === 'text' && c.text.startsWith('<catalogo>'))?.text ?? '')).digest('hex').slice(0, 12),
      textoPeticion: sistema + contenido.filter((c) => c.type === 'text').map((c) => c.text).join(' '),
      orden: contenido.map((c) => (c.type === 'image' ? 'imagen' : c.text.startsWith('<catalogo>') ? 'catalogo' : 'texto')).join(','),
      cacheCatalogo: !!contenido.find((c) => c.type === 'text' && c.text.startsWith('<catalogo>'))?.cache_control,
      reintentosSdk: req.headers['x-stainless-retry-count'] ?? null,
      model: b.model, beta: req.headers['anthropic-beta'] ?? null, fallbacks: b.fallbacks ?? null, effort: b.output_config?.effort,
      formato: b.output_config?.format?.type, bytesImagen: img ? Buffer.from(img.source.data, 'base64').length : 0,
      clave: req.headers['x-api-key'] ? 'presente' : 'falta', maxTokens: b.max_tokens,
      instruccionDirecto: sistema.includes('indican solo el momento en que se hizo la CAPTURA'),
      catalogo: (b.messages?.[0]?.content?.find((c) => c.type === 'text' && c.text.startsWith('<catalogo>'))?.text ?? ''),
    })
    const modo = cola.shift() ?? 'simple'
    if (modo === 'error500') {
      res.writeHead(529, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
    }
    // "error429:3" = límite por minuto con retry-after de 3 s · "error401" = clave mala (permanente).
    if (modo.startsWith('error429')) {
      const ra = modo.split(':')[1]
      res.writeHead(429, { 'Content-Type': 'application/json', ...(ra ? { 'retry-after': ra } : {}) })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit' } }))
    }
    if (modo === 'error401') {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
    }
    const texto = modo === 'json_malo' ? '{"hay_apuestas": "quizá"' : JSON.stringify(RESPUESTAS[modo])
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(
      JSON.stringify({
        id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: b.model,
        content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', stop_sequence: null,
        // Caché simulada: la 1.ª lectura escribe la parte fija; las siguientes la leen.
        usage: conCache
          ? { input_tokens: 1700, output_tokens: modo === 'dos_apuestas' ? 950 : 480, ...(cacheCaliente++ ? { cache_creation_input_tokens: 0, cache_read_input_tokens: 5300 } : { cache_creation_input_tokens: 5300, cache_read_input_tokens: 0 }) }
          : { input_tokens: 2350, output_tokens: modo === 'dos_apuestas' ? 950 : 480, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    )
  }
  res.writeHead(404).end()
}).listen(54322)

console.log('Simulador listo: Supabase en http://localhost:54321 · Claude en http://localhost:54322')
