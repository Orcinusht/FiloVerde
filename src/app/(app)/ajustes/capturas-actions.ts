'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { borrarCapturasAntiguas } from '@/lib/server/limpieza'

// Borra las capturas antiguas del usuario (nunca las pendientes de revisar). Irreversible:
// el botón pide confirmación antes de llamar aquí.
export async function borrarCapturas(): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' }
    const r = await borrarCapturasAntiguas(supabase, userId)
    revalidatePath('/ajustes')
    const fallidas = r.intentadas - r.borradas
    return {
      ok: fallidas === 0,
      mensaje:
        fallidas === 0
          ? `Borradas ${r.borradas} ${r.borradas === 1 ? 'captura' : 'capturas'}.`
          : `Borradas ${r.borradas} de ${r.intentadas}. Vuelve a intentarlo para las demás.`,
    }
  } catch (e) {
    registrarError('capturas:borrar-antiguas', e)
    return { ok: false, mensaje: 'No se han podido borrar. Inténtalo de nuevo.' }
  }
}
