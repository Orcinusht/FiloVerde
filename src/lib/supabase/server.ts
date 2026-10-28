import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

// Cliente de Supabase para el servidor (rutas y componentes de servidor).
// Actúa EN NOMBRE del usuario de la sesión, así que RLS sigue aplicando.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Desde un componente de servidor no se pueden escribir cookies;
          // no pasa nada porque proxy.ts ya renueva la sesión.
        }
      },
    },
  })
}
