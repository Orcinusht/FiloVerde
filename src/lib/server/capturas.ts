import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Capturas en el bucket PRIVADO "capturas", siempre en <user_id>/<uuid>.<ext>.
// Todo pasa por el servidor (el móvil no habla directo con Supabase).

export const BUCKET = 'capturas'
export const MAX_BYTES_CAPTURA = 4 * 1024 * 1024 // 4 MB (Vercel admite ~4,5 MB por petición)

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp'
const EXTENSION: Record<TipoImagen, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Mira los primeros bytes del archivo (no nos fiamos del nombre ni del tipo que diga el navegador).
export function detectarTipo(b: Uint8Array): TipoImagen | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (
    b.length > 12 &&
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return null
}

export function nuevaRuta(userId: string, tipo: TipoImagen): string {
  return `${userId}/${crypto.randomUUID()}.${EXTENSION[tipo]}`
}

// La ruta tiene que ser exactamente una de las que genera nuevaRuta() y del propio usuario.
export function esRutaPropia(ruta: unknown, userId: string): ruta is string {
  if (typeof ruta !== 'string') return false
  const m = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(ruta)
  return Boolean(m && m[1] === userId)
}

// Id del usuario de la sesión (verificado en el servidor) o null.
export async function usuarioActual(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return typeof sub === 'string' ? sub : null
}

export function registrarError(donde: string, e: unknown) {
  const err = (e ?? {}) as { name?: string; message?: string; statusCode?: string | number; status?: number; code?: string }
  console.error(`[${donde}]`, {
    name: err.name,
    code: err.code,
    status: err.status ?? err.statusCode,
    message: String(err.message ?? e).replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 300),
  })
}
