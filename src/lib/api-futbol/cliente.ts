// API-Football: una petición GET con tiempo máximo y un reintento prudente. Sin claves guardadas
// aquí: la clave llega como parámetro desde el servidor (lib/server/api-futbol.ts) y SOLO va en la
// cabecera. Nunca se escribe en logs ni se devuelve. El `fetch` se inyecta para poder probarlo con
// una API simulada.

export type Proveedor = 'direct' | 'rapidapi'
// `base` solo para la prueba local con la API simulada (el servidor solo la acepta en localhost).
export type ConfigApi = { proveedor: Proveedor; clave: string; timeoutMs: number; base?: string }

const BASES: Record<Proveedor, string> = {
  direct: 'https://v3.football.api-sports.io',
  rapidapi: 'https://api-football-v1.p.rapidapi.com/v3',
}
const HOST_RAPIDAPI = 'api-football-v1.p.rapidapi.com'

export const TIEMPO_MAXIMO_MS = 4000
const ESPERA_REINTENTO_MS = 400

export type FetchLike = (url: string, init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal; cache: 'no-store' }) => Promise<{
  status: number
  headers: { get(n: string): string | null }
  json(): Promise<unknown>
}>

export type Fallo = 'tiempo' | 'red' | 'limite' | 'clave' | 'http' | 'forma'
export type Respuesta =
  | { ok: true; json: unknown; cabeceras: { get(n: string): string | null }; status: number }
  | { ok: false; fallo: Fallo; status?: number; retryAfter?: number; cabeceras?: { get(n: string): string | null } }

// La API rechaza cabeceras de más: solo la de la clave (y el host en RapidAPI).
export function cabecerasDe(c: Pick<ConfigApi, 'proveedor' | 'clave'>): Record<string, string> {
  return c.proveedor === 'rapidapi' ? { 'x-rapidapi-key': c.clave, 'x-rapidapi-host': HOST_RAPIDAPI } : { 'x-apisports-key': c.clave }
}

export function urlDe(proveedor: Proveedor, ruta: string, params: Record<string, string>, base?: string): string {
  const q = new URLSearchParams(params).toString()
  return `${base ?? BASES[proveedor]}${ruta}${q ? `?${q}` : ''}`
}

// Dirección alternativa SOLO local (prueba con la API simulada): nunca otra web, para que la clave
// no pueda acabar en otro sitio por un error de configuración.
export function baseLocal(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/\/+$/, '')
  return t && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(t) ? t : undefined
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function unIntento(config: ConfigApi, url: string, timeoutMs: number, fetchImpl: FetchLike): Promise<Respuesta> {
  const control = new AbortController()
  const t = setTimeout(() => control.abort(), timeoutMs)
  try {
    const r = await fetchImpl(url, { method: 'GET', headers: cabecerasDe(config), signal: control.signal, cache: 'no-store' })
    if (r.status === 429) {
      const ra = Number(r.headers.get('retry-after'))
      return { ok: false, fallo: 'limite', status: 429, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined, cabeceras: r.headers }
    }
    if (r.status === 401 || r.status === 403) return { ok: false, fallo: 'clave', status: r.status, cabeceras: r.headers }
    if (r.status < 200 || r.status >= 300) return { ok: false, fallo: 'http', status: r.status, cabeceras: r.headers }
    let json: unknown
    try {
      json = await r.json()
    } catch {
      return { ok: false, fallo: control.signal.aborted ? 'tiempo' : 'forma', status: r.status, cabeceras: r.headers }
    }
    return { ok: true, json, cabeceras: r.headers, status: r.status }
  } catch {
    return { ok: false, fallo: control.signal.aborted ? 'tiempo' : 'red' }
  } finally {
    clearTimeout(t)
  }
}

// GET con tiempo máximo y, si falla la red, se agota el tiempo o la API da 5xx, UN reintento
// (si queda tiempo antes de `limite`). Un 429 o una clave rechazada no se reintentan.
export async function pedir(
  config: ConfigApi,
  ruta: string,
  params: Record<string, string>,
  fetchImpl: FetchLike,
  limite: number = Date.now() + 2 * config.timeoutMs + ESPERA_REINTENTO_MS,
  onIntento?: () => void,
): Promise<Respuesta> {
  const url = urlDe(config.proveedor, ruta, params, config.base)
  let ultimo: Respuesta = { ok: false, fallo: 'tiempo' }
  for (let intento = 1; intento <= 2; intento++) {
    const quedan = limite - Date.now()
    if (quedan < 300) return ultimo
    onIntento?.()
    ultimo = await unIntento(config, url, Math.min(config.timeoutMs, quedan), fetchImpl)
    const reintentable = !ultimo.ok && (ultimo.fallo === 'red' || ultimo.fallo === 'tiempo' || (ultimo.fallo === 'http' && (ultimo.status ?? 0) >= 500))
    if (!reintentable) return ultimo
    if (intento === 1) await esperar(ESPERA_REINTENTO_MS)
  }
  return ultimo
}

// Configuración a partir de las variables de entorno del servidor. Sin API_FOOTBALL_KEY → null:
// la función queda apagada y la app se comporta como siempre.
export function configDesdeEntorno(env: Record<string, string | undefined>): ConfigApi | null {
  const clave = env.API_FOOTBALL_KEY?.trim()
  if (!clave) return null
  const proveedor: Proveedor = env.API_FOOTBALL_PROVIDER?.trim().toLowerCase() === 'rapidapi' ? 'rapidapi' : 'direct'
  return { proveedor, clave, timeoutMs: TIEMPO_MAXIMO_MS, base: baseLocal(env.API_FOOTBALL_BASE_URL) }
}
