// API-Football: partidos de unos días, con caché por usuario y tope diario. Lee primero la caché
// y solo llama a la API si falta o está caducada. Si la API falla, tarda o pone límite, NUNCA
// bloquea: se usa lo que haya (una caché antigua vale más que nada) y el error va al log.
// El almacén (Supabase con la sesión del usuario) y el fetch se inyectan: así se prueba sin red.

import { cacheVigente, DIAS_CACHE, puedeLlamar, sumarDias, type PartidoApi, type Uso } from './emparejar.ts'
import { pedir, type ConfigApi, type FetchLike } from './cliente.ts'
import { cuotaDeCabeceras, leerFixtures } from './respuesta.ts'

export type FilaDia = { fecha: string; partidos: PartidoApi[]; completo: boolean; actualizado: string }
export type FilaUso = Uso & { dia: string; limite_dia: number | null }

// Lo que necesita el servicio de la base de datos (siempre con la sesión del usuario: RLS).
export interface Almacen {
  leerDias(fechas: string[]): Promise<FilaDia[]>
  guardarDia(fila: FilaDia): Promise<void>
  borrarDiasAnterioresA(fecha: string): Promise<void>
  leerUso(dia: string): Promise<FilaUso | null>
  guardarUso(uso: FilaUso): Promise<void>
}

// Log del servidor: etiqueta + datos técnicos (nunca la clave, ni nombres de equipos, ni datos
// personales).
export type Log = (etiqueta: string, datos: Record<string, unknown>) => void

export type Opciones = {
  config: ConfigApi
  almacen: Almacen
  fetch: FetchLike
  log: Log
  ahora: Date
  hoy: string // AAAA-MM-DD en España
  tope: number // llamadas por día y usuario
  minimoRestantes: number
  limite: number // instante (ms) a partir del cual no se empieza ninguna llamada más
}

export type Aviso = 'tope' | 'restantes' | 'pausa' | 'limite' | 'clave' | 'red' | 'tiempo' | 'api'
export type ResultadoDias = { partidos: Map<string, PartidoApi[]>; consultados: Set<string>; avisos: Set<Aviso> }

export const MAX_PAGINAS = 5
const PAUSA_TRAS_429_MS = 5 * 60_000

const diaUtc = (d: Date) => d.toISOString().slice(0, 10)

export async function partidosDeDias(fechas: string[], o: Opciones): Promise<ResultadoDias> {
  const partidos = new Map<string, PartidoApi[]>()
  const consultados = new Set<string>()
  const avisos = new Set<Aviso>()
  if (!fechas.length) return { partidos, consultados, avisos }

  let cache: FilaDia[] = []
  try {
    cache = await o.almacen.leerDias(fechas)
  } catch (e) {
    o.log('[api-futbol:cache]', { paso: 'leer', error: String((e as Error)?.message ?? e).slice(0, 200) })
  }
  const porFecha = new Map(cache.map((f) => [f.fecha, f]))
  const faltan: string[] = []
  for (const f of fechas) {
    const fila = porFecha.get(f)
    if (fila && cacheVigente(fila, o.hoy, o.ahora)) partidos.set(f, fila.partidos)
    else faltan.push(f)
  }
  if (!faltan.length) return { partidos, consultados, avisos }

  // Uso del día (UTC, como la API): uno compartido por todas las llamadas de esta consulta.
  const dia = diaUtc(o.ahora)
  let uso: FilaUso = { dia, llamadas: 0, restantes: null, limite_dia: null, pausa_hasta: null }
  try {
    uso = (await o.almacen.leerUso(dia)) ?? uso
  } catch (e) {
    o.log('[api-futbol:uso]', { paso: 'leer', error: String((e as Error)?.message ?? e).slice(0, 200) })
  }
  let usoCambiado = false

  async function unaLlamada(params: Record<string, string>): Promise<Awaited<ReturnType<typeof pedir>> | null> {
    const permiso = puedeLlamar(uso, o.tope, o.minimoRestantes, new Date())
    if (!permiso.ok) {
      avisos.add(permiso.motivo)
      return null
    }
    const r = await pedir(o.config, '/fixtures', params, o.fetch, o.limite, () => {
      uso = { ...uso, llamadas: uso.llamadas + 1 }
      usoCambiado = true
    })
    const cabeceras = r.ok ? r.cabeceras : r.cabeceras
    if (cabeceras) {
      const q = cuotaDeCabeceras(cabeceras)
      if (q.restantes !== null) uso = { ...uso, restantes: q.restantes }
      if (q.limite !== null) uso = { ...uso, limite_dia: q.limite }
    }
    if (!r.ok && r.fallo === 'limite') {
      const ms = Math.min(Math.max((r.retryAfter ?? 0) * 1000, PAUSA_TRAS_429_MS), 60 * 60_000)
      uso = { ...uso, pausa_hasta: new Date(Date.now() + ms).toISOString() }
      usoCambiado = true
    }
    return r
  }

  async function unDia(fecha: string) {
    const lista: PartidoApi[] = []
    let completo = true
    for (let pagina = 1, paginas = 1; pagina <= paginas; pagina++) {
      if (pagina > MAX_PAGINAS) {
        completo = false
        o.log('[api-futbol:paginas]', { fecha, paginas, maximo: MAX_PAGINAS })
        break
      }
      const params: Record<string, string> = { date: fecha, timezone: 'Europe/Madrid' }
      if (pagina > 1) params.page = String(pagina)
      const r = await unaLlamada(params)
      if (!r) {
        if (pagina === 1) return false
        completo = false
        break
      }
      if (!r.ok) {
        avisos.add(r.fallo === 'http' || r.fallo === 'forma' ? 'api' : r.fallo)
        o.log('[api-futbol:fixtures]', { fecha, pagina, fallo: r.fallo, status: r.status ?? null, retryAfter: r.retryAfter ?? null })
        if (pagina === 1) return false
        completo = false
        break
      }
      const leido = leerFixtures(r.json, fecha)
      if (!leido.ok) {
        const aviso: Aviso = leido.error === 'forma' ? 'api' : leido.error
        avisos.add(aviso)
        if (leido.error === 'limite') {
          uso = { ...uso, pausa_hasta: new Date(Date.now() + PAUSA_TRAS_429_MS).toISOString() }
          usoCambiado = true
        }
        o.log('[api-futbol:fixtures]', { fecha, pagina, fallo: leido.error, status: r.status })
        if (pagina === 1) return false
        completo = false
        break
      }
      if (leido.ignorados) o.log('[api-futbol:forma]', { fecha, pagina, ignorados: leido.ignorados })
      lista.push(...leido.partidos.filter((p) => p.fecha === fecha))
      paginas = leido.paginas
    }
    partidos.set(fecha, lista)
    consultados.add(fecha)
    try {
      await o.almacen.guardarDia({ fecha, partidos: lista, completo, actualizado: new Date().toISOString() })
    } catch (e) {
      o.log('[api-futbol:cache]', { paso: 'guardar', fecha, error: String((e as Error)?.message ?? e).slice(0, 200) })
    }
    return true
  }

  await Promise.all(
    faltan.map(async (f) => {
      const ok = await unDia(f).catch((e) => {
        o.log('[api-futbol:fixtures]', { fecha: f, fallo: 'excepcion', error: String((e as Error)?.message ?? e).slice(0, 200) })
        return false
      })
      // Sin respuesta nueva: una caché antigua vale más que nada.
      if (!ok && porFecha.has(f)) partidos.set(f, porFecha.get(f)!.partidos)
    }),
  )

  if (usoCambiado) {
    try {
      await o.almacen.guardarUso(uso)
    } catch (e) {
      o.log('[api-futbol:uso]', { paso: 'guardar', error: String((e as Error)?.message ?? e).slice(0, 200) })
    }
  }
  if (consultados.size) {
    await o.almacen.borrarDiasAnterioresA(sumarDias(o.hoy, -DIAS_CACHE)).catch((e) =>
      o.log('[api-futbol:cache]', { paso: 'limpiar', error: String((e as Error)?.message ?? e).slice(0, 200) }),
    )
  }
  return { partidos, consultados, avisos }
}
