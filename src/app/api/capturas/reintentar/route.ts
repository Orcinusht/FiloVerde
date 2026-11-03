import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { reintentarBorrados } from '@/lib/server/limpieza'

// POST /api/capturas/reintentar — reintenta en silencio los borrados de capturas que fallaron.
// Responde al momento y hace el trabajo DESPUÉS (no retrasa la lista de apuestas).
export async function POST() {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return new NextResponse(null, { status: 401 })
  after(async () => {
    try {
      const n = await reintentarBorrados(await createClient())
      if (n > 0) console.info('[capturas:reintento]', { borradas: n })
    } catch (e) {
      registrarError('capturas:reintento', e)
    }
  })
  return new NextResponse(null, { status: 202 })
}
