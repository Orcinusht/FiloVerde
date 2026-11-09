import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { comprobarCuenta } from '@/lib/server/api-futbol'

// POST /api/futbol/comprobar — Ajustes → API-Football → "Comprobar": plan y llamadas de hoy
// (/status). Nunca devuelve la clave ni el nombre o email de la cuenta.
export async function POST() {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return NextResponse.json({ ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 })
  try {
    return NextResponse.json(await comprobarCuenta(supabase, userId))
  } catch (e) {
    registrarError('api-futbol:comprobar', e)
    return NextResponse.json({ ok: false, error: 'No se ha podido comprobar API-Football. Inténtalo más tarde.' })
  }
}
