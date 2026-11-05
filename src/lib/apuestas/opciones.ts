// Casas de apuestas y estrategias: reglas de nombre y de uso. Funciones PURAS (las usan el móvil
// y el servidor; las prueba `npm test`). La base de datos repite las reglas (índice único con
// normalizar_nombre, nombres reservados y bloqueo de borrado con apuestas o movimientos).

import { normalizar } from './catalogo.ts'

export type TipoOpcion = 'casa' | 'estrategia'
export const MAX_NOMBRE_OPCION = 80

// Coinciden con etiquetas de Análisis y Bankroll: no se pueden usar como nombre.
export const NOMBRES_RESERVADOS = ['Sin casa', 'Sin estrategia', 'Sin dato', 'Varios', 'Mixto'] as const
export const esReservado = (nombre: string) => NOMBRES_RESERVADOS.some((r) => normalizar(r) === normalizar(nombre))

export const limpiarNombre = (nombre: unknown) => (typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : '')

export type OpcionGestion = { id: string; nombre: string; archivada?: boolean }

export type ValidacionNombre =
  | { ok: true; nombre: string }
  | { ok: false; error: string; existente?: OpcionGestion }

const ART: Record<TipoOpcion, { la: string; una: string }> = {
  casa: { la: 'la casa', una: 'una casa' },
  estrategia: { la: 'la estrategia', una: 'una estrategia' },
}

// Nombre válido: no vacío, ≤ 80, no reservado y sin repetir (sin mayúsculas, tildes ni espacios).
// `idPropio`: al renombrar, la propia entrada no cuenta como repetida.
export function validarNombreOpcion(tipo: TipoOpcion, nombre: unknown, existentes: OpcionGestion[], idPropio?: string): ValidacionNombre {
  const limpio = limpiarNombre(nombre)
  if (!limpio) return { ok: false, error: 'Escribe un nombre.' }
  if (limpio.length > MAX_NOMBRE_OPCION) return { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE_OPCION} caracteres.` }
  if (esReservado(limpio)) return { ok: false, error: `«${limpio}» está reservado (lo usan Análisis y Bankroll). Elige otro nombre.` }
  const igual = existentes.find((o) => o.id !== idPropio && normalizar(o.nombre) === normalizar(limpio))
  if (igual) {
    return {
      ok: false,
      existente: igual,
      error: igual.archivada
        ? `Ya tienes ${ART[tipo].una} archivada llamada «${igual.nombre}». Recupérala en lugar de crear otra.`
        : `Ya tienes ${ART[tipo].una} llamada «${igual.nombre}».`,
    }
  }
  return { ok: true, nombre: limpio }
}

// Uso de cada casa o estrategia: apuestas (de cualquier estado) y, en casas, movimientos de
// bankroll (como origen o como destino de un traspaso).
export type Uso = { apuestas: number; movimientos: number }

export function contarUso(
  tipo: TipoOpcion,
  apuestas: { casa_id: string | null; estrategia_id: string | null }[],
  movimientos: { casa_id: string; casa_destino_id: string | null }[] = [],
): Map<string, Uso> {
  const uso = new Map<string, Uso>()
  const de = (id: string) => uso.get(id) ?? (uso.set(id, { apuestas: 0, movimientos: 0 }), uso.get(id)!)
  for (const a of apuestas) {
    const id = tipo === 'casa' ? a.casa_id : a.estrategia_id
    if (id) de(id).apuestas++
  }
  if (tipo === 'casa') {
    for (const m of movimientos) {
      de(m.casa_id).movimientos++
      if (m.casa_destino_id && m.casa_destino_id !== m.casa_id) de(m.casa_destino_id).movimientos++
    }
  }
  return uso
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

// Mensaje cuando no se puede borrar (null si se puede).
export function motivoNoBorrable(tipo: TipoOpcion, u: Uso | undefined): string | null {
  const ap = u?.apuestas ?? 0
  const mov = u?.movimientos ?? 0
  if (ap === 0 && mov === 0) return null
  if (tipo === 'casa') {
    return `Esta casa tiene ${plural(ap, 'apuesta', 'apuestas')} y ${plural(mov, 'movimiento', 'movimientos')}: no se puede borrar. Puedes renombrarla o archivarla.`
  }
  return `Esta estrategia tiene ${plural(ap, 'apuesta', 'apuestas')}: no se puede borrar. Puedes renombrarla o archivarla.`
}

// En los desplegables para algo NUEVO no salen las archivadas; sí la que ya esté elegida.
export const opcionesVisibles = <T extends OpcionGestion>(opciones: T[], elegida?: string | null) =>
  opciones.filter((o) => !o.archivada || o.id === elegida)

// Busca una casa o estrategia por el nombre leído por la IA (sin mayúsculas, tildes, espacios ni
// signos: "Bet 365" = "bet365"). Incluye las ARCHIVADAS: así la revisión la reconoce como
// existente (y ofrece recuperarla) en vez de intentar crear otra que la regla de nombre rechazaría.
const suelto = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
export function buscarPorNombre<T extends OpcionGestion>(opciones: T[], nombre: string | null | undefined): T | undefined {
  if (!nombre || !suelto(nombre)) return undefined
  return opciones.find((o) => suelto(o.nombre) === suelto(nombre))
}
