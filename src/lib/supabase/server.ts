import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

// Cliente SIN cookies y con flujo "implicit", solo para el registro.
// Así el enlace del email de confirmación trae la sesión en el propio enlace
// y funciona en cualquier navegador (con el flujo PKCE solo valía en el
// navegador donde se hizo el registro). Ver src/app/auth/callback.
export function createRegistroClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
  })
}
