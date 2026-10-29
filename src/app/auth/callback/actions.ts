'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mensajeError } from '@/lib/supabase/errores'

// Convierten lo que trae el enlace de vuelta en una sesión (cookies).
// Si todo va bien redirigen a la app; si no, devuelven false.

// Google (flujo PKCE): llega ?code=...
export async function intercambiarCodigo(code: string): Promise<false> {
  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    mensajeError('callback:code', error)
    return false
  }
  redirect('/apuestas')
}

// Email de confirmación (flujo implicit): llega #access_token=...&refresh_token=...
// setSession comprueba los tokens contra Supabase antes de aceptarlos.
export async function iniciarConTokens(accessToken: string, refreshToken: string): Promise<false> {
  const supabase = await createClient()
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) {
    mensajeError('callback:tokens', error)
    return false
  }
  redirect('/apuestas')
}
