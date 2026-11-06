// Catálogo de deportes y ligas del usuario. Lógica común (móvil y servidor).
// Las apuestas guardan deporte y liga como TEXTO; el catálogo sirve para elegir.

export type DeporteCat = { id: string; nombre: string; archivada?: boolean }
export type LigaCat = { id: string; nombre: string; deporte_id: string; archivada?: boolean }
export type Catalogo = { deportes: DeporteCat[]; ligas: LigaCat[] }

export const DEPORTE_MIXTO = 'Mixto'
export const MAX_NOMBRE_DEPORTE = 60
export const MAX_NOMBRE_LIGA = 80

export const catalogoVacio = (): Catalogo => ({ deportes: [], ligas: [] })

// Igual que public.normalizar_nombre() de la base de datos: sin mayúsculas, tildes
// ni espacios de más. "Fútbol", "futbol" y " FUTBOL " son el mismo.
export function normalizar(t: string | null | undefined): string {
  return (t ?? '')
    .trim()
    .toLowerCase()
    .replace(/[áàâäã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôöõ]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
}

export const esMixto = (t: string | null | undefined) => normalizar(t) === 'mixto'

export function buscarDeporte(cat: Catalogo, nombre: string | null | undefined): DeporteCat | undefined {
  const n = normalizar(nombre)
  return n ? cat.deportes.find((d) => normalizar(d.nombre) === n) : undefined
}

export function ligasDe(cat: Catalogo, deporte: string | null | undefined): LigaCat[] {
  const d = buscarDeporte(cat, deporte)
  return d ? cat.ligas.filter((l) => l.deporte_id === d.id) : []
}

export function buscarLiga(cat: Catalogo, deporte: string | null | undefined, liga: string | null | undefined) {
  const n = normalizar(liga)
  return n ? ligasDe(cat, deporte).find((l) => normalizar(l.nombre) === n) : undefined
}

// Deporte resumen de una apuesta (igual que public.deporte_resumen):
// todas del mismo deporte → ese; varios → "Mixto"; ninguno → ''.
// En el móvil solo se usa para MOSTRARLO: el que se guarda lo calcula la base de datos.
export function deporteResumen(deportes: (string | null | undefined)[]): string {
  const distintos = new Map<string, string>()
  for (const d of deportes) if (normalizar(d)) distintos.set(normalizar(d), (d ?? '').trim())
  if (distintos.size === 0) return ''
  if (distintos.size === 1) return [...distintos.values()][0]
  return DEPORTE_MIXTO
}

// Catálogo en formato compacto para la IA, con tope de tamaño.
// Ej.: {"Fútbol":["LaLiga","Premier League"],"Tenis":["ATP","WTA"]}
export const MAX_CATALOGO_IA = 4000 // caracteres (≈ 1.200 tokens como mucho)
export function catalogoParaIA(cat: Catalogo, max = MAX_CATALOGO_IA): string {
  const obj: Record<string, string[]> = {}
  // Las ARCHIVADAS no se envían (ni las ligas de un deporte archivado): no deben salir en la lectura.
  const activos = cat.deportes.filter((d) => !d.archivada)
  for (const d of activos.slice(0, 60)) obj[d.nombre] = []
  const porId = new Map(activos.map((d) => [d.id, d.nombre]))
  for (const l of cat.ligas.filter((x) => !x.archivada)) {
    const d = porId.get(l.deporte_id)
    if (d && obj[d]) obj[d].push(l.nombre)
  }
  let txt = JSON.stringify(obj)
  // Si no cabe, se recortan ligas (los deportes se mantienen).
  while (txt.length > max) {
    const conMas = Object.entries(obj).sort((a, b) => b[1].length - a[1].length)[0]
    if (!conMas || conMas[1].length === 0) break
    conMas[1].pop()
    txt = JSON.stringify(obj)
  }
  return txt.length > max ? txt.slice(0, max) : txt
}
