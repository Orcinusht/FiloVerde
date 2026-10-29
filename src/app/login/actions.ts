'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Provider } from '@supabase/supabase-js'
import { createClient, createRegistroClient } from '@/lib/supabase/server'
import { MENSAJE_EMAIL_REPETIDO, mensajeError } from '@/lib/supabase/errores'

// El login se hace en el servidor: así los errores reales quedan en los
// logs de Vercel y la sesión se guarda directamente en cookies.

export type Resultado = { error?: string; aviso?: string }

async function urlCallback() {
  const origin = (await headers()).get('origin')
  return `${origin}/auth/callback`
}

export async function entrarConEmail(email: string, password: string): Promise<Resultado> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: mensajeError('entrar', error) }
  } catch (e) {
    return { error: mensajeError('entrar', e) }
  }
  redirect('/apuestas')
}

export async function crearCuenta(email: string, password: string): Promise<Resultado> {
  let conSesion = false
  try {
    const supabase = createRegistroClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: await urlCallback() },
    })
    if (error) return { error: mensajeError('registro', error) }
    // Por privacidad, Supabase no da error si el email ya existe:
    // devuelve un usuario sin identidades.
    if (data.user && data.user.identities?.length === 0) {
      console.warn('[auth:registro]', { code: 'email_exists (oculto por Supabase)' })
      return { error: MENSAJE_EMAIL_REPETIDO }
    }
    // Si en Supabase está desactivada la confirmación por email, entramos ya.
    if (data.session) {
      const servidor = await createClient()
      const { error: e2 } = await servidor.auth.setSession(data.session)
      if (e2) return { error: mensajeError('registro', e2) }
      conSesion = true
    }
  } catch (e) {
    return { error: mensajeError('registro', e) }
  }
  if (conSesion) redirect('/apuestas')
  return { aviso: 'Te hemos enviado un email. Ábrelo y pulsa el enlace para activar tu cuenta.' }
}

export async function entrarConProveedor(provider: Provider): Promise<Resultado> {
  let url: string | undefined
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: await urlCallback() },
    })
    if (error) return { error: mensajeError(`oauth:${provider}`, error) }
    url = data.url ?? undefined
  } catch (e) {
    return { error: mensajeError(`oauth:${provider}`, e) }
  }
  if (!url) return { error: mensajeError(`oauth:${provider}`, new Error('Supabase no devolvió URL')) }
  redirect(url)
}
