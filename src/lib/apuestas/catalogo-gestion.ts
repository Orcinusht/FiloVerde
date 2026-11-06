// Gestión del catálogo de deportes y ligas y detector de posibles errores. Funciones PURAS (las
// usan el servidor y el móvil; las prueba `npm test`). La base de datos repite las reglas (nombre
// único, reservados, no borrar en uso) y hace el renombrado de verdad (renombrar_en_catalogo).
//
// Las selecciones guardan deporte y liga como TEXTO: un deporte "se usa" si alguna selección lo
// tiene escrito igual (sin mayúsculas, tildes ni espacios); una liga, además, con su deporte.

import { normalizar, type Catalogo, type DeporteCat, type LigaCat } from './catalogo.ts'

export type TipoCatalogo = 'deporte' | 'liga'
export const RESERVADOS: Record<TipoCatalogo, readonly string[]> = {
  deporte: ['Mixto', 'Sin dato', 'Varios'],
  liga: ['Sin dato', 'Varios'],
}
export const MAX_NOMBRE: Record<TipoCatalogo, number> = { deporte: 60, liga: 80 }

const limpiar = (n: unknown) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ') : '')

export type ValidacionCatalogo =
  | { ok: true; nombre: string }
  | { ok: false; error: string; existente?: { id: string; nombre: string; archivada?: boolean } }

// `hermanos`: los deportes del usuario, o las ligas DEL MISMO deporte. `idPropio` al renombrar.
export function validarNombreCatalogo(
  tipo: TipoCatalogo,
  nombre: unknown,
  hermanos: { id: string; nombre: string; archivada?: boolean }[],
  idPropio?: string,
): ValidacionCatalogo {
  const n = limpiar(nombre)
  const [el, o] = tipo === 'deporte' ? ['un deporte', 'o'] : ['una liga en este deporte', 'a']
  if (!n) return { ok: false, error: 'Escribe un nombre.' }
  if (n.length > MAX_NOMBRE[tipo]) return { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE[tipo]} caracteres.` }
  if (RESERVADOS[tipo].some((r) => normalizar(r) === normalizar(n))) {
    return { ok: false, error: `«${n}» está reservado (lo usa Análisis). Elige otro nombre.` }
  }
  const igual = hermanos.find((h) => h.id !== idPropio && normalizar(h.nombre) === normalizar(n))
  if (igual) {
    return {
      ok: false,
      existente: igual,
      error: igual.archivada
        ? `Ya tienes ${el} archivad${o} llamad${o} «${igual.nombre}». Recupéral${o} en lugar de crear otr${o}.`
        : `Ya tienes ${el} llamad${o} «${igual.nombre}». No se mezclan: elige otro nombre.`,
    }
  }
  return { ok: true, nombre: n }
}

export type SeleccionCatalogo = {
  id?: string
  apuesta_id: string
  deporte: string | null
  liga: string | null
  evento?: string | null
  evento_fecha?: string | null
  orden?: number
}

export type Uso = { selecciones: number; apuestas: number }

// Selecciones que cambiaría renombrar ese deporte o esa liga (igual que selecciones_de_catalogo).
export function afectadas(tipo: TipoCatalogo, item: DeporteCat | LigaCat, cat: Catalogo, selecciones: SeleccionCatalogo[]): SeleccionCatalogo[] {
  if (tipo === 'deporte') return selecciones.filter((s) => normalizar(s.deporte) === normalizar(item.nombre) && normalizar(item.nombre) !== '')
  const d = cat.deportes.find((x) => x.id === (item as LigaCat).deporte_id)
  if (!d) return []
  return selecciones.filter((s) => normalizar(s.deporte) === normalizar(d.nombre) && normalizar(s.liga) === normalizar(item.nombre))
}

export function uso(lista: SeleccionCatalogo[]): Uso {
  return { selecciones: lista.length, apuestas: new Set(lista.map((s) => s.apuesta_id)).size }
}

// Uso de todo el catálogo: id → { selecciones, apuestas }.
export function usoCatalogo(cat: Catalogo, selecciones: SeleccionCatalogo[]): Map<string, Uso> {
  const m = new Map<string, Uso>()
  for (const d of cat.deportes) m.set(d.id, uso(afectadas('deporte', d, cat, selecciones)))
  for (const l of cat.ligas) m.set(l.id, uso(afectadas('liga', l, cat, selecciones)))
  return m
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

export function textoAviso(u: Uso): string {
  if (u.selecciones === 0) return 'No afecta a ninguna apuesta.'
  return `Afecta a ${plural(u.selecciones, 'selección', 'selecciones')} en ${plural(u.apuestas, 'apuesta', 'apuestas')}: también cambia en ellas.`
}

export function motivoNoBorrable(tipo: TipoCatalogo, u: Uso | undefined, ligasEnUso = 0): string | null {
  if (u && u.selecciones > 0) {
    const que = tipo === 'deporte' ? 'Este deporte' : 'Esta liga'
    const lo = tipo === 'deporte' ? 'lo' : 'la'
    return `${que} está en ${plural(u.selecciones, 'selección', 'selecciones')} de ${plural(u.apuestas, 'apuesta', 'apuestas')}: no se puede borrar. Puedes renombrar${lo} o archivar${lo}.`
  }
  if (tipo === 'deporte' && ligasEnUso > 0) return `Tiene ${plural(ligasEnUso, 'liga en uso', 'ligas en uso')}: no se puede borrar.`
  return null
}

// ---------- Detector de posibles errores ----------
// Regla: selecciones del MISMO partido (texto del evento sin mayúsculas, tildes ni espacios, con
// "vs" y los guiones tratados igual) y MISMA fecha del evento con ligas (contando "Sin liga") o
// deportes distintos. Se ignoran las selecciones sin fecha o sin evento. Es una PISTA, no un error
// seguro: solo agrupa partidos escritos igual y no ve las selecciones sin fecha.

export const SIN_LIGA = 'Sin liga'

export function clavePartido(evento: string | null | undefined): string {
  return normalizar(evento)
    .replace(/\s*(\bvs\b\.?|\bv\b\.?|[-–—])\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type GrupoSospechoso = {
  clave: string
  partido: string // texto más usado
  fecha: string // AAAA-MM-DD
  ligas: { liga: string; deporte: string; selecciones: number; apuestas: string[] }[]
  apuestas: string[] // todas las implicadas
  porApuesta: Record<string, string[]> // apuesta → «liga · deporte» de SUS selecciones de este partido
}

export function detectarPosiblesErrores(selecciones: SeleccionCatalogo[]): GrupoSospechoso[] {
  const grupos = new Map<string, SeleccionCatalogo[]>()
  for (const s of selecciones) {
    const p = clavePartido(s.evento)
    if (!p || !s.evento_fecha) continue
    const k = `${p}|${s.evento_fecha}`
    grupos.set(k, [...(grupos.get(k) ?? []), s])
  }
  const salida: GrupoSospechoso[] = []
  for (const [k, lista] of grupos) {
    const ligas = new Set(lista.map((s) => normalizar(s.liga)))
    const deportes = new Set(lista.map((s) => normalizar(s.deporte)))
    if (ligas.size < 2 && deportes.size < 2) continue
    const textos = new Map<string, number>()
    for (const s of lista) textos.set(s.evento!.trim(), (textos.get(s.evento!.trim()) ?? 0) + 1)
    const porLiga = new Map<string, GrupoSospechoso['ligas'][number]>()
    for (const s of lista) {
      const kl = `${normalizar(s.deporte)}|${normalizar(s.liga)}`
      const g = porLiga.get(kl) ?? { liga: s.liga?.trim() || SIN_LIGA, deporte: s.deporte?.trim() || '—', selecciones: 0, apuestas: [] }
      g.selecciones++
      if (!g.apuestas.includes(s.apuesta_id)) g.apuestas.push(s.apuesta_id)
      porLiga.set(kl, g)
    }
    salida.push({
      clave: k,
      partido: [...textos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0][0],
      fecha: lista[0].evento_fecha!,
      ligas: [...porLiga.values()].sort((a, b) => b.selecciones - a.selecciones || a.liga.localeCompare(b.liga, 'es')),
      apuestas: [...new Set(lista.map((s) => s.apuesta_id))],
      porApuesta: lista.reduce<Record<string, string[]>>((acc, s) => {
        const t = `${s.liga?.trim() || SIN_LIGA} · ${s.deporte?.trim() || '—'}`
        acc[s.apuesta_id] = [...new Set([...(acc[s.apuesta_id] ?? []), t])]
        return acc
      }, {}),
    })
  }
  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.partido.localeCompare(b.partido, 'es'))
}
