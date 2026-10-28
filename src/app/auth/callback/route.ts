import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Aquí vuelve el usuario tras entrar con Google o tras pulsar el enlace
// de confirmación del email. Cambiamos el "code" por una sesión (cookies).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}/apuestas`)
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
