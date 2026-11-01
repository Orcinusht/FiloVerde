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
