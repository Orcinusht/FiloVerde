import 'server-only'

// Claves SECRETAS y ajustes del servidor: solo se pueden leer desde código de servidor.
// Si algún componente del navegador importa este archivo, la compilación falla
// (eso es lo que hace `import 'server-only'`).

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY (configúrala en .env.local y en Vercel).')
  return key
}

export function hayAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

// Modelo de IA que lee las capturas. Se cambia SIN tocar código con la variable
// ANTHROPIC_MODEL (Vercel → Settings → Environment Variables → Redeploy).
//   claude-sonnet-5-5  → por defecto: buena lectura, precio medio
//   claude-opus-5-5    → si la lectura falla a menudo (≈ el doble de caro)
//   claude-haiku-5-5   → el más barato (más errores en combinadas)
export const MODELO_POR_DEFECTO = 'claude-sonnet-5-5'

export function getAnthropicModel(): string {
  const m = process.env.ANTHROPIC_MODEL?.trim()
  return m && /^[a-z0-9.-]{3,80}$/.test(m) ? m : MODELO_POR_DEFECTO
}

// ---------- API-Football (solo fútbol) ----------
// Clave SECRETA en API_FOOTBALL_KEY (Vercel → Settings → Environment Variables). Sin clave, la
// función queda apagada y la app funciona como siempre. Nunca se envía al navegador ni a los logs.
//   API_FOOTBALL_PROVIDER   direct (por defecto: v3.football.api-sports.io) · rapidapi
//   API_FOOTBALL_TOPE_DIARIO  llamadas por día y usuario (por defecto 300)
export function hayApiFootballKey(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY?.trim())
}

export function getApiFootballKey(): string | null {
  return process.env.API_FOOTBALL_KEY?.trim() || null
}

export function getApiFootballProvider(): 'direct' | 'rapidapi' {
  return process.env.API_FOOTBALL_PROVIDER?.trim().toLowerCase() === 'rapidapi' ? 'rapidapi' : 'direct'
}

export function getApiFootballTope(porDefecto: number): number {
  const v = Number(process.env.API_FOOTBALL_TOPE_DIARIO?.trim())
  return Number.isInteger(v) && v >= 0 && v <= 100000 ? v : porDefecto
}
