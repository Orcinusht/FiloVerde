import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import type { Exportacion } from '@/lib/exportar/leer'
import { nombreArchivo } from '@/lib/exportar/csv'
import type { SupabaseClient } from '@supabase/supabase-js'

// Respuesta común de /api/exportar/apuestas y /api/exportar/selecciones.
// Errores: mensaje en español para el usuario; el error real, al log (sin datos personales).
export async function responderCsv(
  que: 'apuestas' | 'selecciones',
  exportar: (supabase: SupabaseClient, userId: string) => Promise<Exportacion>,
) {
  const error = (status: number, mensaje: string) =>
    NextResponse.json({ error: mensaje }, { status, headers: { 'Cache-Control': 'no-store' } })

  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return error(401, 'Tu sesión ha caducado. Vuelve a entrar para descargar tu copia.')

  let r: Exportacion
  try {
    r = await exportar(supabase, userId)
  } catch (e) {
    registrarError(`exportar:${que}`, e)
    return error(500, 'No se ha podido preparar la copia. Inténtalo de nuevo en un momento.')
  }
  if (r.filas === 0) {
    return error(404, 'Todavía no tienes apuestas registradas: no hay nada que exportar.')
  }

  const archivo = nombreArchivo(que)
  return new NextResponse(r.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
      'X-Filoverde-Filas': String(r.filas),
      'X-Filoverde-Archivo': archivo,
    },
  })
}
