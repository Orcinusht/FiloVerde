'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerCasas } from '@/lib/bankroll/leer'
import { validarMovimiento, type DatosMovimiento } from '@/lib/bankroll/calculos'

// Alta, edición y borrado de movimientos de bankroll. Todo con la sesión del usuario (RLS); el
// usuario sale de la sesión y las casas se comprueban contra SUS casas (la base de datos también
// lo impide). Errores: mensaje en español y el error real al log, sin datos personales.

const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.'
const FALLO = 'No se ha podido guardar el movimiento. Inténtalo de nuevo en un momento.'

export type EntradaMovimiento = {
  tipo: string
  dia: string
  importe: number // céntimos, positivo
  signo: '+' | '-'
  casa_id: string
  casa_destino_id: string | null
  notas: string
}

export type RespuestaMovimiento = { ok: true; id: string } | { ok: false; error: string; errores?: Partial<Record<keyof DatosMovimiento, string>> }

// Traduce los errores de la base de datos a algo comprensible.
function mensajeBD(e: { code?: string; hint?: string; message?: string }): string {
  if (e.hint === 'fecha') return 'La fecha no puede ser futura: registra el movimiento cuando se haga.'
  if (e.code === '23503') return 'Esa casa ya no existe. Recarga la página y elígela de nuevo.'
  if (e.code === '23514') return 'Revisa los datos: importe, casa y casa de destino.'
  return FALLO
}

export async function guardarMovimiento(id: string | null, entrada: EntradaMovimiento): Promise<RespuestaMovimiento> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, error: SIN_SESION }

    let fechaGuardada: string | null = null
    if (id) {
      const { data, error } = await supabase.from('movimientos_bankroll').select('fecha').eq('id', id).eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (!data) return { ok: false, error: 'Este movimiento ya no existe.' }
      fechaGuardada = data.fecha
    }

    const casas = new Set((await leerCasas(supabase, userId)).map((c) => c.id))
    const v = validarMovimiento(entrada, casas, new Date(), fechaGuardada)
    if (!v.ok) return { ok: false, error: Object.values(v.errores)[0] ?? 'Revisa los datos.', errores: v.errores }

    const fila = { ...v.datos }
    if (id) {
      const { data, error } = await supabase.from('movimientos_bankroll').update(fila).eq('id', id).eq('user_id', userId).select('id').maybeSingle()
      if (error) {
        registrarError('bankroll:editar', error)
        return { ok: false, error: mensajeBD(error) }
      }
      if (!data) return { ok: false, error: 'Este movimiento ya no existe.' }
      revalidatePath('/bankroll', 'layout')
      return { ok: true, id: data.id }
    }
    const { data, error } = await supabase.from('movimientos_bankroll').insert(fila).select('id').single()
    if (error) {
      registrarError('bankroll:crear', error)
      return { ok: false, error: mensajeBD(error) }
    }
    revalidatePath('/bankroll', 'layout')
    return { ok: true, id: data.id }
  } catch (e) {
    registrarError('bankroll:guardar', e)
    return { ok: false, error: FALLO }
  }
}

export async function borrarMovimiento(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) return { ok: false, error: SIN_SESION }
    const { data, error } = await supabase.from('movimientos_bankroll').delete().eq('id', id).eq('user_id', userId).select('id')
    if (error) {
      registrarError('bankroll:borrar', error)
      return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
    }
    if (!data?.length) return { ok: false, error: 'Este movimiento ya no existe.' }
    revalidatePath('/bankroll', 'layout')
    return { ok: true }
  } catch (e) {
    registrarError('bankroll:borrar', e)
    return { ok: false, error: 'No se ha podido borrar. Inténtalo de nuevo.' }
  }
}
