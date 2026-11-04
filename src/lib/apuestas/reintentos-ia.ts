// Errores de la lectura con IA: cómo se clasifican, cuáles se reintentan y cuánto se espera.
// Funciones puras (sin la librería de Anthropic): las usa el servidor para clasificar y el móvil
// para decidir el reintento. Probadas en tests/logica.test.ts.

export type CodigoErrorIA =
  | 'sin_clave'
  | 'clave_invalida'
  | 'sin_credito'
  | 'saturado' // Anthropic saturado (529) o fallo suyo (5xx)
  | 'limite' // límite por minuto de la cuenta de Anthropic (429)
  | 'timeout'
  | 'conexion'
  | 'rechazo'
  | 'incompleto'
  | 'json_invalido'
  | 'imagen_invalida'
  | 'desconocido'

// Intentos TOTALES por captura (el primero + 2 reintentos). La librería de Anthropic no reintenta
// por su cuenta (maxRetries: 0): así son exactamente 3.
export const MAX_INTENTOS = 3
// Espera antes de cada reintento (segundos, ±25 % al azar). La tercera es la pausa del lote tras
// un 429 sin retry-after.
export const ESPERAS_S = [2, 5, 10] as const
// Si Anthropic pide esperar más de esto, no se reintenta solo: se avisa al usuario.
export const MAX_RETRY_AFTER_S = 60

const TEMPORALES = new Set<CodigoErrorIA>(['saturado', 'limite', 'timeout', 'conexion'])
export const esTemporal = (c: string | null | undefined): boolean => TEMPORALES.has(c as CodigoErrorIA)

// Clasifica un error de la API de Anthropic a partir de sus datos (sin la librería).
export function clasificarErrorApi(e: {
  status?: number | null
  tipo?: string | null // error.type: overloaded_error, rate_limit_error, billing_error…
  codigoDetalle?: string | null // error.details.error_code (p. ej. enforced_spend_limit_reached)
  mensaje?: string | null
  esTimeout?: boolean
  esConexion?: boolean
}): CodigoErrorIA {
  if (e.esTimeout) return 'timeout'
  if (e.esConexion) return 'conexion'
  const status = e.status ?? 0
  const mensaje = e.mensaje ?? ''
  if (status === 401 || status === 403) return 'clave_invalida'
  if (status === 402 || e.tipo === 'billing_error') return 'sin_credito'
  if (status === 429) {
    // El tope de gasto mensual también llega como 429, pero reintentar no sirve.
    if (e.codigoDetalle === 'enforced_spend_limit_reached' || /usage limits|spend limit/i.test(mensaje)) return 'sin_credito'
    return 'limite'
  }
  if (status === 400) {
    if (/credit|billing|spend limit|usage limits/i.test(mensaje)) return 'sin_credito'
    if (/image/i.test(mensaje)) return 'imagen_invalida'
    return 'desconocido'
  }
  if (status === 408) return 'timeout'
  if (status === 529 || e.tipo === 'overloaded_error' || status >= 500) return 'saturado'
  return 'desconocido'
}

// Cabecera retry-after → segundos (número o fecha HTTP). Sin cabecera o ilegible → null.
export function leerRetryAfter(valor: string | null | undefined, ahora = Date.now()): number | null {
  if (valor == null || valor.trim() === '') return null
  const n = Number(valor)
  if (Number.isFinite(n)) return n >= 0 ? n : null
  const f = Date.parse(valor)
  if (Number.isNaN(f)) return null
  return Math.max(0, Math.ceil((f - ahora) / 1000))
}

// ¿Cuánto esperar antes del reintento tras el intento `intento` (1 = el primero)? null = no
// reintentar (se agotaron los intentos o Anthropic pide esperar demasiado).
export function esperaAntesDeReintentar(a: { intento: number; retryAfterS?: number | null; azar?: number }): number | null {
  if (a.intento >= MAX_INTENTOS) return null
  const base = ESPERAS_S[Math.max(0, a.intento - 1)] ?? ESPERAS_S[ESPERAS_S.length - 1]
  const azar = a.azar ?? Math.random()
  let s = base * (0.75 + azar * 0.5)
  if (a.retryAfterS != null) {
    if (a.retryAfterS > MAX_RETRY_AFTER_S) return null
    s = Math.max(s, a.retryAfterS)
  }
  return Math.round(s * 1000)
}

// Pausa del lote antes de la siguiente captura cuando una acabó en 429 (límite por minuto).
export function pausaLoteTrasLimite(retryAfterS?: number | null): number {
  const s = retryAfterS != null ? Math.min(retryAfterS, MAX_RETRY_AFTER_S) : ESPERAS_S[2]
  return Math.round(s * 1000)
}

export const MENSAJES_ERROR_IA: Record<CodigoErrorIA, string> = {
  sin_clave: 'La lectura automática no está configurada todavía (falta la clave de la IA). Puedes rellenarla a mano.',
  clave_invalida: 'La clave de la IA no es válida. Revísala en Vercel (ANTHROPIC_API_KEY). Mientras, puedes rellenarla a mano.',
  sin_credito: 'La cuenta de la IA se ha quedado sin crédito o ha llegado a su límite de gasto. Puedes rellenarla a mano.',
  saturado: 'La IA está saturada en este momento (lo he intentado 3 veces). Espera un poco y pulsa «Reintentar», o rellénala a mano.',
  limite: 'Has alcanzado el límite de lecturas de la IA por minuto. Espera un minuto y pulsa «Reintentar», o rellénala a mano.',
  timeout: 'La IA ha tardado demasiado en responder (lo he intentado 3 veces). Pulsa «Reintentar» o rellénala a mano.',
  conexion: 'No se ha podido conectar con la IA. Comprueba internet y pulsa «Reintentar».',
  rechazo: 'La IA no ha querido procesar esta imagen. Rellénala a mano.',
  incompleto: 'La respuesta de la IA llegó cortada. Pulsa «Reintentar».',
  json_invalido: 'La IA ha devuelto datos que no se entienden. Pulsa «Reintentar» o rellénala a mano.',
  imagen_invalida: 'La IA no ha podido abrir la imagen. Prueba con otra captura.',
  desconocido: 'Algo ha fallado al leer la captura. Pulsa «Reintentar» o rellénala a mano.',
}
