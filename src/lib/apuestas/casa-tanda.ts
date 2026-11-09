import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizar } from './catalogo.ts'

// Registro, tarea 2a: "Casa de esta tanda". El usuario elige la casa ANTES de subir las capturas
// (o "Que la detecte la IA"). Funciones puras y una lectura con la sesión del usuario (RLS); las
// prueba `npm test`.

export const CASA_IA = '' // valor del selector para "Que la detecte la IA"
export const TEXTO_CASA_IA = 'Que la detecte la IA'

type CasaOpcion = { id: string; nombre: string; archivada?: boolean }
export type CasaIndicada = { id: string; nombre: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Opciones del selector: las casas ACTIVAS (sin archivadas), por nombre.
export function opcionesCasaTanda(casas: CasaOpcion[]): CasaOpcion[] {
  return casas.filter((c) => !c.archivada).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Preseleccionada: la casa de la última apuesta guardada, si sigue activa; si no, "Que la detecte la IA".
export function casaPreseleccionada(casas: CasaOpcion[], ultimaCasaId: string | null | undefined): string {
  return ultimaCasaId && opcionesCasaTanda(casas).some((c) => c.id === ultimaCasaId) ? ultimaCasaId : CASA_IA
}

// La casa que llega del navegador solo vale si es una casa ACTIVA del usuario (la lista sale de su
// sesión). Cualquier otra cosa (otro usuario, archivada, inventada) → null = "Que la detecte la IA".
export function resolverCasaIndicada(id: unknown, casasDelUsuario: CasaOpcion[]): CasaIndicada | null {
  if (typeof id !== 'string' || !UUID.test(id)) return null
  const c = casasDelUsuario.find((x) => x.id === id && !x.archivada)
  return c ? { id: c.id, nombre: c.nombre } : null
}

// Texto para la IA (como DATOS): sin los signos que podrían cerrar la etiqueta.
export const casaParaIA = (nombre: string) => nombre.replace(/[<>]/g, '').slice(0, 80)

// ¿Avisar "La captura parece de X"? Solo si la IA dice que la casa es CLARAMENTE distinta, la
// escribió, no la marcó como dudosa y no coincide (sin mayúsculas, tildes ni espacios) con la elegida.
export function avisoDeCasa(
  a: { casa?: string | null; casa_distinta?: boolean | null; dudosos?: { campo: string }[] | null },
  indicada: CasaIndicada | null,
): string | null {
  if (!indicada || a.casa_distinta !== true) return null
  const vista = (a.casa ?? '').trim()
  if (!vista) return null
  if ((a.dudosos ?? []).some((d) => d.campo.trim() === 'casa')) return null
  if (normalizar(vista) === normalizar(indicada.nombre)) return null
  return vista.slice(0, 80)
}

// Casa de la última apuesta guardada del usuario (con su sesión y su id). null si no hay.
export async function leerUltimaCasa(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('apuestas')
    .select('casa_id')
    .eq('user_id', userId)
    .not('casa_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as { casa_id: string | null } | null)?.casa_id ?? null
}

// Al retomar una revisión: la casa elegida que se guardó dentro de la lectura (si es válida).
export function casaIndicadaGuardada(propuesta: unknown): CasaIndicada | null {
  const c = (propuesta as { casa_indicada?: unknown } | null)?.casa_indicada as { id?: unknown; nombre?: unknown } | undefined
  if (!c || typeof c.id !== 'string' || !UUID.test(c.id) || typeof c.nombre !== 'string' || !c.nombre.trim()) return null
  return { id: c.id, nombre: c.nombre.slice(0, 80) }
}
