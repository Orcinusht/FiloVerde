// Estados y tipos de apuesta (los mismos que permite la base de datos).

export const ESTADOS_APUESTA = [
  'pendiente',
  'ganada',
  'perdida',
  'anulada',
  'cash_out',
  'media_ganada',
  'media_perdida',
] as const
export type EstadoApuesta = (typeof ESTADOS_APUESTA)[number]

// Las selecciones usan los mismos estados menos el cash out.
export const ESTADOS_SELECCION = ESTADOS_APUESTA.filter((e) => e !== 'cash_out') as Exclude<
  EstadoApuesta,
  'cash_out'
>[]
export type EstadoSeleccion = Exclude<EstadoApuesta, 'cash_out'>

export const TIPOS_APUESTA = ['simple', 'combinada', 'sistema'] as const
export type TipoApuesta = (typeof TIPOS_APUESTA)[number]

export const NOMBRE_ESTADO: Record<EstadoApuesta, string> = {
  pendiente: 'Pendiente',
  ganada: 'Ganada',
  perdida: 'Perdida',
  anulada: 'Anulada',
  cash_out: 'Cash out',
  media_ganada: 'Media ganada',
  media_perdida: 'Media perdida',
}

export const NOMBRE_TIPO: Record<TipoApuesta, string> = {
  simple: 'Simple',
  combinada: 'Combinada',
  sistema: 'Sistema',
}

// Clases de color para la etiqueta de estado.
export const COLOR_ESTADO: Record<EstadoApuesta, string> = {
  pendiente: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  ganada: 'bg-green-500/15 text-green-700 dark:text-green-400',
  media_ganada: 'bg-green-500/15 text-green-700 dark:text-green-400',
  perdida: 'bg-red-500/15 text-red-700 dark:text-red-400',
  media_perdida: 'bg-red-500/15 text-red-700 dark:text-red-400',
  anulada: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  cash_out: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
}

export function esEstadoApuesta(v: unknown): v is EstadoApuesta {
  return typeof v === 'string' && (ESTADOS_APUESTA as readonly string[]).includes(v)
}
export function esEstadoSeleccion(v: unknown): v is EstadoSeleccion {
  return esEstadoApuesta(v) && v !== 'cash_out'
}
export function esTipoApuesta(v: unknown): v is TipoApuesta {
  return typeof v === 'string' && (TIPOS_APUESTA as readonly string[]).includes(v)
}
