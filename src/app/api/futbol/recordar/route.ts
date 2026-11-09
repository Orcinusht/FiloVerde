import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { recordarElecciones } from '@/lib/server/api-futbol'

const Entrada = z.object({
  elecciones: z
    .array(
      z.object({
        partidoId: z.number().int().positive(),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        evento: z.string().min(1).max(200),
        liga: z.string().max(80),
      }),
    )
    .min(1)
    .max(30),
})

// POST /api/futbol/recordar  { elecciones } — tras GUARDAR una apuesta: recuerda las equivalencias
// de equipos y ligas de los partidos aceptados (para que la próxima vez salgan a la primera).
// Si falla, no pasa nada (la apuesta ya está guardada).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 })
  const cuerpo = Entrada.safeParse(await request.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  try {
    const n = await recordarElecciones(supabase, userId, cuerpo.data.elecciones)
    return NextResponse.json({ ok: true, recordadas: n })
  } catch (e) {
    registrarError('api-futbol:recordar', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
