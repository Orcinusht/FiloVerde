import 'server-only'

// Precio público por millón de tokens (dólares), para calcular el coste aproximado.
// Si cambias de modelo y no está aquí, se guardan los tokens y el coste queda vacío.
// Caché: escribir cuesta 1,25 × la entrada (5 minutos); leer, `lecturaCache`.
const PRECIOS: Record<string, { entrada: number; salida: number; lecturaCache: number }> = {
  'claude-sonnet-5-5': { entrada: 2, salida: 10, lecturaCache: 0.2 },
  'claude-opus-5-5': { entrada: 4, salida: 20, lecturaCache: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, lecturaCache: 0.01 },
}

export type TokensEntrada = { sinCache: number; escritos: number; leidos: number }

export function costeUsd(modelo: string, entrada: number | TokensEntrada, tokensSalida: number): number | null {
  const p = PRECIOS[modelo]
  if (!p) return null
  const e = typeof entrada === 'number' ? { sinCache: entrada, escritos: 0, leidos: 0 } : entrada
  const dolares = e.sinCache * p.entrada + e.escritos * p.entrada * 1.25 + e.leidos * p.lecturaCache + tokensSalida * p.salida
  return Math.round((dolares / 1_000_000) * 1_000_000) / 1_000_000
}
