import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Todo menos archivos estáticos, iconos, manifest y service worker.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|icon.png|apple-icon.png|manifest.webmanifest|sw.js).*)',
  ],
}
