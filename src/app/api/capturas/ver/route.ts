import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BUCKET, esRutaPropia, registrarError, usuarioActual } from '@/lib/server/capturas'

// GET /api/capturas/ver?ruta=<user_id>/<archivo> — muestra una captura propia.
// El servidor la descarga de Supabase con tu sesión (RLS) y te la pasa.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return new NextResponse('Sin sesión', { status: 401 })

  const ruta = request.nextUrl.searchParams.get('ruta')
  if (!esRutaPropia(ruta, userId)) return new NextResponse('No encontrada', { status: 404 })

  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error || !data) {
    registrarError('capturas:ver', error)
    return new NextResponse('No encontrada', { status: 404 })
  }
  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      // Solo en tu navegador (nunca en cachés compartidas); el archivo no cambia.
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
