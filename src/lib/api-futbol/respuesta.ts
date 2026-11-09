// API-Football: leer sus respuestas SIN fiarse de su forma (esquemas zod). Un partido con forma
// rara se ignora (no rompe la consulta); una respuesta sin la forma básica es un error.

import { z } from 'zod'
import type { PartidoApi } from './emparejar.ts'

const Errores = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional()

const Base = z.object({
  errors: Errores,
  results: z.number().optional(),
  paging: z.object({ current: z.number().int(), total: z.number().int() }).optional(),
  response: z.array(z.unknown()),
})

const Fixture = z.object({
  fixture: z.object({
    id: z.number().int().positive(),
    date: z.string(),
    status: z.object({ short: z.string().max(10).optional() }).optional(),
  }),
  league: z.object({ id: z.number().int().positive(), name: z.string().min(1).max(120), country: z.string().max(80).nullish() }),
  teams: z.object({
    home: z.object({ id: z.number().int().positive(), name: z.string().min(1).max(120) }),
    away: z.object({ id: z.number().int().positive(), name: z.string().min(1).max(120) }),
  }),
})

export type ErrorApi = 'limite' | 'clave' | 'api'

// errors puede venir como [] (sin errores) o como objeto {requests: "..."}, {token: "..."}…
// (¡con estado HTTP 200!).
export function errorDeLaRespuesta(errors: unknown): ErrorApi | null {
  if (!errors) return null
  if (Array.isArray(errors)) return errors.length ? 'api' : null
  if (typeof errors !== 'object') return null
  const claves = Object.keys(errors as object).map((k) => k.toLowerCase())
  if (!claves.length) return null
  if (claves.some((k) => k.includes('request') || k.includes('ratelimit') || k.includes('limit'))) return 'limite'
  if (claves.some((k) => k.includes('token') || k.includes('key') || k.includes('access') || k.includes('subscription'))) return 'clave'
  return 'api'
}

export type PaginaFixtures =
  | { ok: true; partidos: PartidoApi[]; pagina: number; paginas: number; ignorados: number }
  | { ok: false; error: ErrorApi | 'forma' }

// Una página de /fixtures?date=… Las horas vienen ya en hora de España (timezone=Europe/Madrid):
// "2026-11-08T21:00:00+01:00" → día 2026-11-08, hora 21:00.
export function leerFixtures(json: unknown, diaPedido: string): PaginaFixtures {
  const base = Base.safeParse(json)
  if (!base.success) {
    const e = errorDeLaRespuesta((json as { errors?: unknown } | null)?.errors)
    return { ok: false, error: e ?? 'forma' }
  }
  const e = errorDeLaRespuesta(base.data.errors)
  if (e) return { ok: false, error: e }
  const partidos: PartidoApi[] = []
  let ignorados = 0
  for (const item of base.data.response) {
    const f = Fixture.safeParse(item)
    const m = f.success ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(f.data.fixture.date) : null
    if (!f.success || !m) {
      ignorados++
      continue
    }
    const d = f.data
    partidos.push({
      id: d.fixture.id,
      fecha: m[1] || diaPedido,
      hora: m[2] === '00:00' && d.fixture.status?.short === 'TBD' ? '' : m[2],
      liga_id: d.league.id,
      liga: d.league.name,
      pais: d.league.country ?? '',
      local_id: d.teams.home.id,
      local: d.teams.home.name,
      visitante_id: d.teams.away.id,
      visitante: d.teams.away.name,
      estado: d.fixture.status?.short ?? '',
    })
  }
  const pagina = base.data.paging?.current ?? 1
  const paginas = Math.max(1, base.data.paging?.total ?? 1)
  return { ok: true, partidos, pagina, paginas, ignorados }
}

// /status: solo lo que se enseña en Ajustes (nunca el nombre ni el email de la cuenta).
const Estado = z.object({
  errors: Errores,
  response: z.object({
    subscription: z.object({ plan: z.string().max(40).optional(), active: z.boolean().optional() }).partial().optional(),
    requests: z.object({ current: z.number().int().nonnegative(), limit_day: z.number().int().nonnegative() }),
  }),
})

export type EstadoCuenta = { plan: string | null; activa: boolean | null; usadas: number; limite: number }

export function leerEstado(json: unknown): { ok: true; estado: EstadoCuenta } | { ok: false; error: ErrorApi | 'forma' } {
  const r = Estado.safeParse(json)
  if (!r.success) {
    const e = errorDeLaRespuesta((json as { errors?: unknown } | null)?.errors)
    return { ok: false, error: e ?? 'forma' }
  }
  const e = errorDeLaRespuesta(r.data.errors)
  if (e) return { ok: false, error: e }
  const s = r.data.response
  return {
    ok: true,
    estado: { plan: s.subscription?.plan ?? null, activa: s.subscription?.active ?? null, usadas: s.requests.current, limite: s.requests.limit_day },
  }
}

// Cabeceras de cuota diaria (x-ratelimit-requests-*). null si no vienen o no son números.
export function cuotaDeCabeceras(h: { get(n: string): string | null }): { restantes: number | null; limite: number | null } {
  const num = (n: string) => {
    const v = h.get(n)
    if (v === null || !/^\d+$/.test(v.trim())) return null
    return Number(v.trim())
  }
  return { restantes: num('x-ratelimit-requests-remaining'), limite: num('x-ratelimit-requests-limit') }
}
