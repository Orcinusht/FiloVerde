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

export const TIPOS_APUESTA = ['simple', 'combinada', 'mismo_partido', 'sistema'] as const
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
  mismo_partido: 'Mismo partido',
  sistema: 'Sistema',
}

// Nombre largo (formulario): "Crear apuesta" es como lo llaman muchas casas.
export const NOMBRE_TIPO_LARGO: Record<TipoApuesta, string> = {
  ...NOMBRE_TIPO,
  mismo_partido: 'Crear apuesta / Mismo partido',
}

// Mínimo de selecciones de cada tipo (y máximo en la simple).
export const MIN_SELECCIONES: Record<TipoApuesta, number> = {
  simple: 1,
  combinada: 2,
  mismo_partido: 2,
  sistema: 3,
}

// Tipos con varias selecciones con cuota propia (en "mismo partido" no la tienen).
export const TIPOS_CON_CUOTA_POR_SELECCION: readonly TipoApuesta[] = ['combinada', 'sistema']

// Por qué un dato se marca "a revisar".
export const MOTIVOS_DUDA = ['no_visible', 'borroso', 'deducido'] as const
export type MotivoDuda = (typeof MOTIVOS_DUDA)[number]
// En la revisión, además: "nueva" = deporte o liga que no está en tu catálogo · "falta" = dato
// necesario que no se ve ni se puede calcular · "propuesta" = la IA lo ha leído y hay que confirmarlo
// (tipo de promoción).
export type MotivoRevision = MotivoDuda | 'nueva' | 'falta' | 'propuesta'
export const NOMBRE_MOTIVO: Record<MotivoRevision, string> = {
  no_visible: 'no visible',
  borroso: 'borroso',
  deducido: 'deducido',
  nueva: 'nueva',
  falta: 'falta',
  propuesta: 'confírmalo',
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
