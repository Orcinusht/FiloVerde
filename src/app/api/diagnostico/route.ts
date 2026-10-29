import { connection } from 'next/server'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/config'

// Diagnóstico de configuración: dice si las variables de Supabase existen y
// tienen buena pinta, y si Supabase responde. NUNCA muestra sus valores.
// Abrir: https://<tu-app>/api/diagnostico
export async function GET() {
  await connection() // siempre en el momento, nunca precalculado

  // Valor copiado en la app al compilar (es el que usa el navegador)…
  const compilada = { url: SUPABASE_URL, clave: SUPABASE_PUBLISHABLE_KEY }
  // …y valor actual en Vercel (si difiere, falta volver a desplegar).
  const env = process.env
  const actual = {
    url: env['NEXT_PUBLIC_SUPABASE_' + 'URL'],
    clave: env['NEXT_PUBLIC_SUPABASE_' + 'PUBLISHABLE_KEY'],
  }

  return Response.json(
    {
      variables_en_la_app_compilada: describir(compilada.url, compilada.clave),
      variables_ahora_en_vercel: describir(actual.url, actual.clave),
      coinciden: compilada.url === actual.url && compilada.clave === actual.clave,
      conexion_con_supabase: await probarConexion(compilada.url, compilada.clave),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function describir(url?: string, clave?: string) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: {
      existe: Boolean(url),
      tiene_espacios: url ? url !== url.trim() : false,
      formato_correcto: url ? /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url.trim()) : false,
    },
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
      existe: Boolean(clave),
      tiene_espacios: clave ? clave !== clave.trim() : false,
      tipo: tipoDeClave(clave?.trim()),
      longitud: clave?.length ?? 0,
    },
  }
}

function tipoDeClave(clave?: string): string {
  if (!clave) return 'falta'
  if (clave.startsWith('sb_publishable_')) return 'publishable (correcta)'
  if (clave.startsWith('sb_secret_')) return '¡SECRETA! (incorrecta: quítala de Vercel ya)'
  if (clave.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(clave.split('.')[1], 'base64url').toString()).role
      if (role === 'anon') return 'anon antigua (correcta)'
      if (role === 'service_role') return '¡SERVICE_ROLE! (incorrecta: quítala de Vercel ya)'
      return `JWT con rol desconocido`
    } catch {
      return 'parece JWT pero no se puede leer (¿cortada?)'
    }
  }
  return 'desconocido (¿pegaste otra cosa?)'
}

// Pide a Supabase su configuración pública de Auth (no requiere sesión).
async function probarConexion(url?: string, clave?: string) {
  if (!url || !clave) return { ok: false, motivo: 'faltan variables' }
  try {
    const res = await fetch(`${url.trim().replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: clave.trim() },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const cuerpo = await res.text()
      return { ok: false, estado_http: res.status, respuesta: cuerpo.slice(0, 200) }
    }
    const s = await res.json()
    return {
      ok: true,
      registro_permitido: !s.disable_signup,
      login_email_activado: Boolean(s.external?.email),
      login_google_activado: Boolean(s.external?.google),
      confirmar_email_obligatorio: !s.mailer_autoconfirm,
    }
  } catch (e) {
    return { ok: false, motivo: 'no se pudo conectar', detalle: (e as Error).message }
  }
}
