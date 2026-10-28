import 'server-only'

// Claves SECRETAS: solo se pueden leer desde código de servidor.
// Si algún componente del navegador importa este archivo, la compilación falla
// (eso es lo que hace `import 'server-only'`).
//
// Fase 1: la clave de la API de Claude se leerá aquí y solo la usarán
// rutas de servidor (src/app/api/...). Nunca con el prefijo NEXT_PUBLIC_.
export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY (configúrala en .env.local y en Vercel).')
  return key
}
