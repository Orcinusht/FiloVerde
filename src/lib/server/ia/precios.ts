import 'server-only'

// Precio público por millón de tokens (dólares), para calcular el coste aproximado.
// Si cambias de modelo y no está aquí, se guardan los tokens y el coste queda vacío.
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-opus-5-5': { entrada: 4, salida: 20 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
}

export function costeUsd(modelo: string, tokensEntrada: number, tokensSalida: number): number | null {
  const p = PRECIOS[modelo]
  if (!p) return null
  return Math.round(((tokensEntrada * p.entrada + tokensSalida * p.salida) / 1_000_000) * 1_000_000) / 1_000_000
}
