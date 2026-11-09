import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { configDesdeEntorno, pedir, type ConfigApi, type FetchLike } from '@/lib/api-futbol/cliente'
import { cuotaDeCabeceras, leerEstado, type EstadoCuenta } from '@/lib/api-futbol/respuesta'
import { partidosDeDias, type Almacen, type FilaDia, type FilaUso, type Log } from '@/lib/api-futbol/servicio'
import { consultarSelecciones, mapaRecordados, textoAviso, type RespuestaConsulta, type SeleccionConsulta } from '@/lib/api-futbol/consulta'
import {
  claveEquipo,
  equiposARecordar,
  estaInvertido,
  esDeFutbol,
  MINIMO_RESTANTES,
  TOPE_POR_DEFECTO,
  type EquivalenciaLiga,
  type LigaCatalogo,
  type PartidoApi,
} from '@/lib/api-futbol/emparejar'
import { buscarDeporte, normalizar } from '@/lib/apuestas/catalogo'
import { diaEnMadridTexto } from '@/lib/apuestas/formulario'
import { leerCatalogo } from '@/lib/server/catalogo'
import { getApiFootballKey, getApiFootballProvider, getApiFootballTope } from '@/lib/server/env'

// API-Football desde el servidor, SIEMPRE con la sesión del usuario (RLS: solo su caché y sus
// equivalencias) y filtrando además por su id. La clave sale de la variable de entorno y solo va
// en la cabecera de la petición: nunca en logs ni en lo que se devuelve al móvil.

// Plazo total de una consulta desde la revisión: nunca hace esperar más.
export const PLAZO_CONSULTA_MS = 6000

function config(): ConfigApi | null {
  return configDesdeEntorno(process.env)
}

// Log sin claves ni datos personales: solo datos técnicos (etiqueta, fecha, fallo, estado…).
const log: Log = (etiqueta, datos) => {
  const clave = getApiFootballKey()
  let texto = JSON.stringify(datos)
  if (clave) texto = texto.split(clave).join('[clave]')
  console.error(etiqueta, texto.replace(/[^\s@"]+@[^\s@"]+/g, '[email]').slice(0, 500))
}

const fetchServidor: FetchLike = (url, init) => fetch(url, init)

function almacen(supabase: SupabaseClient, userId: string): Almacen {
  return {
    async leerDias(fechas) {
      const { data, error } = await supabase
        .from('api_futbol_dias')
        .select('fecha, partidos, completo, actualizado')
        .eq('user_id', userId)
        .in('fecha', fechas)
      if (error) throw error
      return (data ?? []).map((f) => ({ ...f, partidos: Array.isArray(f.partidos) ? (f.partidos as PartidoApi[]) : [] })) as FilaDia[]
    },
    async guardarDia(f) {
      const { error } = await supabase.from('api_futbol_dias').upsert({ user_id: userId, ...f }, { onConflict: 'user_id,fecha' })
      if (error) throw error
    },
    async borrarDiasAnterioresA(fecha) {
      const { error } = await supabase.from('api_futbol_dias').delete().eq('user_id', userId).lt('fecha', fecha)
      if (error) throw error
      await supabase.from('api_futbol_uso').delete().eq('user_id', userId).lt('dia', fecha)
    },
    async leerUso(dia) {
      const { data, error } = await supabase
        .from('api_futbol_uso')
        .select('dia, llamadas, restantes, limite_dia, pausa_hasta')
        .eq('user_id', userId)
        .eq('dia', dia)
        .maybeSingle()
      if (error) throw error
      return (data as FilaUso | null) ?? null
    },
    async guardarUso(u) {
      const { error } = await supabase
        .from('api_futbol_uso')
        .upsert({ user_id: userId, ...u, actualizado: new Date().toISOString() }, { onConflict: 'user_id,dia' })
      if (error) throw error
    },
  }
}

async function contexto(supabase: SupabaseClient, userId: string) {
  const [catalogo, eqLigas, eqEquipos] = await Promise.all([
    leerCatalogo(supabase),
    supabase.from('api_futbol_ligas').select('liga_api_id, liga_id').eq('user_id', userId).limit(1000),
    supabase.from('api_futbol_equipos').select('nombre_captura, equipo_id').eq('user_id', userId).limit(1000),
  ])
  if (eqLigas.error) log('[api-futbol:equivalencias]', { tabla: 'ligas', error: eqLigas.error.message })
  if (eqEquipos.error) log('[api-futbol:equivalencias]', { tabla: 'equipos', error: eqEquipos.error.message })
  const futbol = buscarDeporte(catalogo, 'Fútbol')
  const catalogoFutbol: LigaCatalogo[] = futbol ? catalogo.ligas.filter((l) => l.deporte_id === futbol.id) : []
  return {
    catalogo,
    futbol,
    catalogoFutbol,
    equivalencias: (eqLigas.data ?? []) as EquivalenciaLiga[],
    recordados: mapaRecordados((eqEquipos.data ?? []) as { nombre_captura: string; equipo_id: number }[]),
  }
}

export async function consultarPartidos(supabase: SupabaseClient, userId: string, selecciones: SeleccionConsulta[]): Promise<RespuestaConsulta> {
  const c = config()
  if (!c) return { activa: false, resultados: [], aviso: null }
  const aConsultar = selecciones.filter((s) => esDeFutbol(s.deporte))
  if (!aConsultar.length) return { activa: true, resultados: [], aviso: null }
  const limite = Date.now() + PLAZO_CONSULTA_MS
  const ahora = new Date()
  const hoy = diaEnMadridTexto(ahora)
  let ctx: Awaited<ReturnType<typeof contexto>>
  try {
    ctx = await contexto(supabase, userId)
  } catch (e) {
    log('[api-futbol:contexto]', { error: String((e as Error)?.message ?? e).slice(0, 200) })
    return { activa: true, resultados: [], aviso: 'No se ha podido consultar API-Football ahora mismo: sigue como siempre.' }
  }
  const alm = almacen(supabase, userId)
  const r = await consultarSelecciones(
    aConsultar,
    { hoy, catalogoFutbol: ctx.catalogoFutbol, equivalencias: ctx.equivalencias, recordados: ctx.recordados },
    (fechas) =>
      partidosDeDias(fechas, {
        config: c,
        almacen: alm,
        fetch: fetchServidor,
        log,
        ahora,
        hoy,
        tope: getApiFootballTope(TOPE_POR_DEFECTO),
        minimoRestantes: MINIMO_RESTANTES,
        limite,
      }),
    () => limite - Date.now() > 1500,
  )
  return { activa: true, resultados: r.resultados, aviso: textoAviso(r.avisos) }
}

// ---------- recordar al guardar ----------

export type Recordar = { partidoId: number; fecha: string; evento: string; liga: string }

// Al guardar la apuesta: por cada selección con un partido de la API aceptado, se guardan las
// equivalencias del nombre escrito en la captura con sus equipos y de la liga de la API con la de
// TU catálogo. Los datos del partido salen de TU caché (no se fía del navegador).
export async function recordarElecciones(supabase: SupabaseClient, userId: string, lista: Recordar[]): Promise<number> {
  if (!config() || !lista.length) return 0
  const fechas = [...new Set(lista.map((x) => x.fecha))]
  const { data, error } = await supabase.from('api_futbol_dias').select('fecha, partidos').eq('user_id', userId).in('fecha', fechas)
  if (error) throw error
  const porId = new Map<number, PartidoApi>()
  for (const d of data ?? []) for (const p of (Array.isArray(d.partidos) ? d.partidos : []) as PartidoApi[]) porId.set(p.id, p)
  const catalogo = await leerCatalogo(supabase)
  const futbol = buscarDeporte(catalogo, 'Fútbol')
  const equipos = new Map<string, { user_id: string; nombre_captura: string; equipo_id: number; equipo_nombre: string; actualizado: string }>()
  const ligas = new Map<number, { user_id: string; liga_api_id: number; liga_api_nombre: string; pais: string; liga_id: string; actualizado: string }>()
  const ahora = new Date().toISOString()
  for (const x of lista) {
    const p = porId.get(x.partidoId)
    if (!p) continue
    for (const e of equiposARecordar(x.evento, p, estaInvertido(x.evento, p))) equipos.set(e.nombre_captura, { user_id: userId, ...e, actualizado: ahora })
    const liga = futbol && catalogo.ligas.find((l) => l.deporte_id === futbol.id && normalizar(l.nombre) === normalizar(x.liga))
    if (liga) ligas.set(p.liga_id, { user_id: userId, liga_api_id: p.liga_id, liga_api_nombre: p.liga.slice(0, 120), pais: p.pais.slice(0, 80), liga_id: liga.id, actualizado: ahora })
  }
  if (equipos.size) {
    const { error: e } = await supabase.from('api_futbol_equipos').upsert([...equipos.values()], { onConflict: 'user_id,nombre_captura' })
    if (e) throw e
  }
  if (ligas.size) {
    const { error: e } = await supabase.from('api_futbol_ligas').upsert([...ligas.values()], { onConflict: 'user_id,liga_api_id' })
    if (e) throw e
  }
  return equipos.size + ligas.size
}

// ---------- Ajustes ----------

export type EstadoApiFutbol = {
  configurada: boolean
  proveedor: 'direct' | 'rapidapi'
  tope: number
  hoy: { llamadas: number; restantes: number | null; limite: number | null; actualizado: string | null } | null
}

export async function estadoApiFutbol(supabase: SupabaseClient, userId: string): Promise<EstadoApiFutbol> {
  const configurada = !!config()
  const base = { configurada, proveedor: getApiFootballProvider(), tope: getApiFootballTope(TOPE_POR_DEFECTO), hoy: null }
  if (!configurada) return base
  const { data } = await supabase
    .from('api_futbol_uso')
    .select('llamadas, restantes, limite_dia, actualizado')
    .eq('user_id', userId)
    .eq('dia', new Date().toISOString().slice(0, 10))
    .maybeSingle()
  return { ...base, hoy: data ? { llamadas: data.llamadas, restantes: data.restantes, limite: data.limite_dia, actualizado: data.actualizado } : null }
}

// "Comprobar" en Ajustes: /status (según la documentación de la API no gasta llamadas del día).
// Solo devuelve plan y llamadas (nunca el nombre ni el email de la cuenta).
export async function comprobarCuenta(supabase: SupabaseClient, userId: string): Promise<{ ok: true; estado: EstadoCuenta } | { ok: false; error: string }> {
  const c = config()
  if (!c) return { ok: false, error: 'API-Football no está configurada (falta API_FOOTBALL_KEY en Vercel).' }
  const r = await pedir(c, '/status', {}, fetchServidor)
  if (!r.ok) {
    log('[api-futbol:status]', { fallo: r.fallo, status: r.status ?? null })
    return { ok: false, error: r.fallo === 'clave' ? 'API-Football rechaza la clave: revísala en Vercel.' : 'No se ha podido contactar con API-Football. Inténtalo más tarde.' }
  }
  const e = leerEstado(r.json)
  if (!e.ok) {
    log('[api-futbol:status]', { fallo: e.error })
    return { ok: false, error: e.error === 'clave' ? 'API-Football rechaza la clave: revísala en Vercel.' : 'API-Football ha respondido algo inesperado. Inténtalo más tarde.' }
  }
  // Se guarda lo que queda hoy según la cuenta (para el tope y para enseñarlo).
  const dia = new Date().toISOString().slice(0, 10)
  const q = cuotaDeCabeceras(r.cabeceras)
  const restantes = Math.max(0, e.estado.limite - e.estado.usadas)
  const { data: previo } = await supabase.from('api_futbol_uso').select('llamadas, pausa_hasta').eq('user_id', userId).eq('dia', dia).maybeSingle()
  await supabase.from('api_futbol_uso').upsert(
    { user_id: userId, dia, llamadas: previo?.llamadas ?? 0, pausa_hasta: previo?.pausa_hasta ?? null, restantes, limite_dia: q.limite ?? e.estado.limite, actualizado: new Date().toISOString() },
    { onConflict: 'user_id,dia' },
  )
  return { ok: true, estado: e.estado }
}

export { claveEquipo }
