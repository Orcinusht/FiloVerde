import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { mensajeError } from '@/lib/supabase/errores'

// Aquí llega el enlace del email de confirmación (plantilla en Supabase →
// Authentication → Emails → Confirm signup). Funciona en cualquier navegador:
// valida el token del enlace y deja la sesión iniciada.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}/apuestas`)
    mensajeError('confirmar-email', error)
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}
