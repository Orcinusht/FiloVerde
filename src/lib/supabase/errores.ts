import 'server-only'

// Traduce los errores de Supabase Auth a mensajes claros en español y
// registra el error real en los logs del servidor (Vercel → Logs).
// Nunca se registran emails ni contraseñas.

const MENSAJES: Record<string, string> = {
  user_already_exists: 'Ya existe una cuenta con ese email. Prueba a entrar.',
  email_exists: 'Ya existe una cuenta con ese email. Prueba a entrar.',
  weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres mezclando letras y números.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
  over_email_send_rate_limit: 'Se ha alcanzado el límite de emails por hora. Espera un rato y vuelve a probar.',
  email_not_confirmed: 'Falta confirmar tu email. Abre el enlace que te enviamos (revisa también spam).',
  invalid_credentials: 'Email o contraseña incorrectos.',
}

export const MENSAJE_INESPERADO = 'Algo ha fallado. Inténtalo de nuevo.'
export const MENSAJE_EMAIL_REPETIDO = MENSAJES.email_exists

type ErrorAuth = { name?: string; code?: string; status?: number; message?: string }

export function mensajeError(accion: string, error: unknown): string {
  const e = (error ?? {}) as ErrorAuth
  console.error(`[auth:${accion}]`, {
    name: e.name,
    code: e.code,
    status: e.status,
    message: ocultarEmails(e.message ?? String(error)),
  })

  const codigo = e.code && MENSAJES[e.code] ? e.code : codigoPorTexto(e.message ?? '')
  if (codigo) return MENSAJES[codigo]
  if (e.status === 429) return MENSAJES.over_request_rate_limit
  // Mostramos el código técnico (sin datos personales) para poder diagnosticar.
  const ref = [e.code, e.status].filter(Boolean).join(' · ') || e.name
  return ref ? `${MENSAJE_INESPERADO} (código: ${ref})` : MENSAJE_INESPERADO
}

// Por si Supabase no envía el código: lo deducimos del texto (en inglés).
function codigoPorTexto(mensaje: string): string | undefined {
  if (/already (been )?registered|already exists/i.test(mensaje)) return 'email_exists'
  if (/email rate limit/i.test(mensaje)) return 'over_email_send_rate_limit'
  if (/rate limit/i.test(mensaje)) return 'over_request_rate_limit'
  if (/email not confirmed/i.test(mensaje)) return 'email_not_confirmed'
  if (/invalid login credentials/i.test(mensaje)) return 'invalid_credentials'
  if (/password should|weak password/i.test(mensaje)) return 'weak_password'
  return undefined
}

function ocultarEmails(texto: string): string {
  return texto.replace(/[^\s@]+@[^\s@]+/g, '[email]')
}
