// Direcciones de la pantalla Análisis y de su detalle. Todo el estado va en la dirección (periodo,
// segmento, orden, filtros…), así se puede recargar, volver atrás o entrar en una apuesta y
// regresar al mismo sitio. URLSearchParams codifica y decodifica los valores (tildes, espacios,
// "/", "&"…). Funciones puras: las prueba `npm test`.

import {
  esAgrupacionAcierto,
  esColor,
  esSegmento,
  esSegmentoSelector,
  type AgrupacionAcierto,
  type Color,
  type PeticionDetalle,
  type Segmento,
} from './calculos.ts'
import { rutaVueltaSegura } from '../navegador/volver-a-lista.ts'

type Params = Record<string, string | string[] | undefined> | URLSearchParams

// Parámetros de la pantalla Análisis que se conservan al ir y volver del detalle.
// "casa" y "volver" solo llegan cuando el detalle se abre desde Gráficas.
export const PARAMS_ANALISIS = ['periodo', 'desde', 'hasta', 'seg', 'orden', 'ac', 'tipo', 'casa', 'volver'] as const

function valor(p: Params, k: string): string {
  if (p instanceof URLSearchParams) return p.get(k) ?? ''
  const v = p[k]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

function consulta(p: Params, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  for (const k of PARAMS_ANALISIS) {
    const v = valor(p, k)
    if (v) q.set(k, v)
  }
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
  return q.toString()
}

// "/analisis?…" con el mismo periodo, segmento y filtros (sin lo propio del detalle).
// Si el detalle era de un mes o un día (Evolución), "seg" no es del selector: no se lleva.
export function enlaceAnalisis(p: Params): string {
  const q = new URLSearchParams(consulta(p))
  if (q.has('seg') && !esSegmentoSelector(q.get('seg'))) q.delete('seg')
  q.delete('casa') // Análisis no filtra por casa
  q.delete('volver')
  const s = q.toString()
  return s ? `/analisis?${s}` : '/analisis'
}

// "/graficas?…" con el mismo periodo (desde Análisis: "Ver evolución →").
export function enlaceGraficas(p: Params): string {
  const q = new URLSearchParams()
  for (const k of ['periodo', 'desde', 'hasta']) {
    const v = valor(p, k)
    if (v) q.set(k, v)
  }
  const s = q.toString()
  return s ? `/graficas?${s}` : '/graficas'
}

// Detalle de una serie de Gráficas: la fila del segmento con el periodo y la casa, y "volver" a
// la pantalla de Gráficas tal como estaba.
export function enlaceDetalleGraficas(p: Params, seg: Segmento, clave: string, volver: string): string {
  const q = new URLSearchParams()
  for (const k of ['periodo', 'desde', 'hasta', 'casa']) {
    const v = valor(p, k)
    if (v) q.set(k, v)
  }
  q.set('vista', 'seg')
  q.set('seg', seg)
  q.set('clave', clave)
  q.set('volver', volver)
  return `/analisis/detalle?${q.toString()}`
}

export function enlaceDetalleSegmento(p: Params, seg: Segmento, clave: string): string {
  return `/analisis/detalle?${consulta(p, { vista: 'seg', seg, clave })}`
}

export function enlaceDetalleAcierto(p: Params, por: AgrupacionAcierto, clave: string, color: Color = 'todas'): string {
  return `/analisis/detalle?${consulta(p, { vista: 'aciertos', ac: por, clave, color: color === 'todas' ? '' : color })}`
}

// Lee la petición del detalle. Valores fuera de lo previsto → null (la página dice "no existe").
export function leerPeticionDetalle(p: Params): PeticionDetalle | null {
  const clave = valor(p, 'clave')
  if (!clave || clave.length > 300) return null
  if (valor(p, 'vista') === 'aciertos') {
    const por = valor(p, 'ac') || 'mercado'
    if (!esAgrupacionAcierto(por)) return null
    const color = valor(p, 'color') || 'todas'
    return { vista: 'aciertos', por, clave, tipo: valor(p, 'tipo') || undefined, color: esColor(color) ? color : 'todas' }
  }
  const seg = valor(p, 'seg') || 'casa'
  if (!esSegmento(seg)) return null
  return { vista: 'seg', seg, clave }
}

// A dónde vuelve el detalle: a Gráficas si se abrió desde allí (con ?volver= seguro y el periodo
// que tenga AHORA el detalle, por si se cambió) o, si no, a Análisis.
export function vueltaDetalle(p: Params): { href: string; texto: string } {
  const v = rutaVueltaSegura(valor(p, 'volver'), '')
  if (v === '/graficas' || v.startsWith('/graficas?')) {
    const q = new URLSearchParams(v.split('?')[1] ?? '')
    for (const k of ['periodo', 'desde', 'hasta']) {
      const x = valor(p, k)
      if (x) q.set(k, x)
      else q.delete(k)
    }
    q.delete('mas')
    const s = q.toString()
    return { href: s ? `/graficas?${s}` : '/graficas', texto: '← Gráficas' }
  }
  return { href: enlaceAnalisis(p), texto: '← Análisis' }
}
