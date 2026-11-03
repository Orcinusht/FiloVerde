// Emojis de deporte: SOLO decoración (no se guardan; se ocultan a lectores de pantalla).
// Se asocian por el nombre, sin distinguir mayúsculas ni tildes.
import { esMixto, normalizar } from './catalogo.ts'

const EMOJIS: Record<string, string> = {
  futbol: '⚽',
  tenis: '🎾',
  baloncesto: '🏀',
  beisbol: '⚾',
  'futbol americano': '🏈',
  hockey: '🏒',
  balonmano: '🤾',
  voleibol: '🏐',
  rugby: '🏉',
  'mma/boxeo': '🥊',
}

export const EMOJI_OTRO = '🏅'
export const EMOJI_MIXTO = '🔀'

export function emojiDeporte(nombre: string | null | undefined): string {
  if (!nombre || !nombre.trim()) return ''
  if (esMixto(nombre)) return EMOJI_MIXTO
  return EMOJIS[normalizar(nombre)] ?? EMOJI_OTRO
}
