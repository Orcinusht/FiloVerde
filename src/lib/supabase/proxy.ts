import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

// Rutas a las que se puede entrar sin sesión.
const RUTAS_PUBLICAS = ['/login', '/auth']

// Renueva la sesión en cada visita (así no caduca mientras uses la app)
// y manda a /login a quien no tenga sesión.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // No pongas código entre createServerClient y getClaims.
  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims)
  const { pathname } = request.nextUrl
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`))

  if (!conSesion && !esPublica) {
    return redirigir(request, '/login', response)
  }
  if (conSesion && pathname === '/login') {
    return redirigir(request, '/apuestas', response)
  }
  return response
}

// Redirige conservando las cookies de sesión recién renovadas.
function redirigir(request: NextRequest, destino: string, base: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = destino
  url.search = ''
  const redirect = NextResponse.redirect(url)
  base.cookies.getAll().forEach((c) => redirect.cookies.set(c))
  return redirect
}
