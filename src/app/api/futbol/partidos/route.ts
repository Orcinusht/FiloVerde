import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { consultarPartidos } from '@/lib/server/api-futbol'

// La consulta nunca debe hacer esperar de más (plazo propio de ~6 s).
export const maxDuration = 20

const Entrada = z.object({
  selecciones: z
    .array(
      z.object({
        indice: z.number().int().min(0).max(50),
        evento: z.string().max(200),
        fecha: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
        hora: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]),
        liga: z.string().max(80),
        deporte: z.string().max(60),
      }),
    )
    .max(30),
})

// POST /api/futbol/partidos  { selecciones } — partidos oficiales de API-Football para las
// selecciones de fútbol de la revisión. Si la API falla, responde igual (sin resultados y con un
// aviso): el registro sigue como siempre. Nunca devuelve la clave ni datos de la cuenta.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 })
  const cuerpo = Entrada.safeParse(await request.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  try {
    const r = await consultarPartidos(supabase, userId, cuerpo.data.selecciones)
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    registrarError('api-futbol:partidos', e)
    return NextResponse.json({ activa: true, resultados: [], aviso: 'No se ha podido consultar API-Football ahora mismo: sigue como siempre.' })
  }
}
