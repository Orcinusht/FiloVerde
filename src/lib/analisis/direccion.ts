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

type Params = Record<string, string | string[] | undefined> | URLSearchParams

// Parámetros de la pantalla Análisis que se conservan al ir y volver del detalle.
export const PARAMS_ANALISIS = ['periodo', 'desde', 'hasta', 'seg', 'orden', 'ac', 'tipo'] as const

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
  const s = q.toString()
  return s ? `/analisis?${s}` : '/analisis'
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
