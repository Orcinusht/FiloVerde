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

const db = new PGlite()
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
    else if (op === 'is' && val === 'null') where.push(`${col} is null`)
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

async function rest(req, res, url, cuerpo) {
  const claims = leerToken(req)
  const partes = url.pathname.replace('/rest/v1/', '').split('/')
  const prefer = req.headers.prefer ?? ''
  const unObjeto = (req.headers.accept ?? '').includes('vnd.pgrst.object')

  const resultado = await comoUsuario(claims, async (tx) => {
    if (partes[0] === 'rpc') {
      const args = JSON.parse(cuerpo || '{}')
      const nombres = Object.keys(args)
      const valores = nombres.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))
      const lista = nombres.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')
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
      const limit = url.searchParams.get('limit')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      let total
      if (prefer.includes('count=exact')) {
        total = (await tx.query(`select count(*)::int n from public.${tabla} ${where}`, valores)).rows[0].n
      }
      const { rows } = await tx.query(
        `select ${cols} from public.${tabla} ${where} ${orderBy} ${limit ? `limit ${Number(limit)}` : ''} offset ${offset}`,
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
          ks.map((k) => fila[k]),
        )
        salida.push(...rows)
      }
      return { cuerpo: prefer.includes('return=representation') ? salida : null }
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

async function storage(req, res, url, cuerpoBuf) {
  const claims = leerToken(req)
  const resto = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''))
  const [bucket, ...trozos] = resto.split('/')
  const nombre = trozos.join('/')

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
  evento, liga: 'LaLiga', deporte: 'Fútbol', mercado: '1X2', pronostico, cuota, estado: null, ...extra,
})
const RESPUESTAS = {
  simple: {
    es_apuesta: true, motivo: null, casa: 'Bet365', tipo: 'simple', fecha: '2026-10-31T20:45', importe: 10,
    cuota_total: '1.85', ganancia_potencial: 18.5, estado: null, importe_cobrado: null,
    selecciones: [sel('Real Betis - Sevilla FC', 'Real Betis', '1.85')], dudosos: [],
  },
  combinada: {
    es_apuesta: true, motivo: null, casa: 'Codere', tipo: 'combinada', fecha: '2026-11-01T16:00', importe: 5,
    cuota_total: '+450', ganancia_potencial: 27.5, estado: null, importe_cobrado: null,
    selecciones: [
      sel('Valencia - Villarreal', 'Empate', '6/4'),
      sel('Athletic - Osasuna', 'Athletic', '2.00', { mercado: null }),
    ],
    dudosos: ['selecciones.1.mercado', 'ganancia_potencial'],
  },
  resuelta: {
    es_apuesta: true, motivo: null, casa: 'Bet365', tipo: 'simple', fecha: '2026-10-25T18:30', importe: 20,
    cuota_total: '2.10', ganancia_potencial: 42, estado: 'ganada', importe_cobrado: 42,
    selecciones: [sel('Getafe - Girona', 'Girona', '2.10', { estado: 'ganada' })], dudosos: [],
  },
  no_apuesta: {
    es_apuesta: false, motivo: 'Es una foto de un perro, no un resguardo de apuesta.', casa: null, tipo: null, fecha: null,
    importe: null, cuota_total: null, ganancia_potencial: null, estado: null, importe_cobrado: null, selecciones: [], dudosos: [],
  },
}
let cola = []
export const llamadasIA = []

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const cuerpo = (await leerCuerpo(req)).toString()
  if (url.pathname === '/__cola') {
    cola = JSON.parse(cuerpo)
    return res.writeHead(204).end()
  }
  if (url.pathname === '/__llamadas') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(llamadasIA))
  }
  if (url.pathname.startsWith('/v1/messages')) {
    const b = JSON.parse(cuerpo)
    const img = b.messages?.[0]?.content?.find((c) => c.type === 'image')
    llamadasIA.push({
      model: b.model, beta: req.headers['anthropic-beta'] ?? null, fallbacks: b.fallbacks ?? null, effort: b.output_config?.effort,
      formato: b.output_config?.format?.type, bytesImagen: img ? Buffer.from(img.source.data, 'base64').length : 0,
      clave: req.headers['x-api-key'] ? 'presente' : 'falta',
    })
    const modo = cola.shift() ?? 'simple'
    if (modo === 'error500') {
      res.writeHead(529, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
    }
    const texto = modo === 'json_malo' ? '{"es_apuesta": "quizá"' : JSON.stringify(RESPUESTAS[modo])
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(
      JSON.stringify({
        id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: b.model,
        content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 2350, output_tokens: 480, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    )
  }
  res.writeHead(404).end()
}).listen(54322)

console.log('Simulador listo: Supabase en http://localhost:54321 · Claude en http://localhost:54322')
