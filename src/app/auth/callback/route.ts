import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mensajeError } from '@/lib/supabase/errores'

// Aquí vuelve el usuario tras entrar con Google (y emails con la plantilla
// antigua). Cambiamos el "code" por una sesión (cookies).
// Solo funciona en el mismo navegador donde se empezó; por eso el email de
// confirmación usa /auth/confirm.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}/apuestas`)
    mensajeError('callback', error)
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
