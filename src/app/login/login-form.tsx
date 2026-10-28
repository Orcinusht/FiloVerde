'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Provider } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { PROVEEDORES } from './providers'

type Modo = 'entrar' | 'registro'

const input =
  'h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error') ? 'No se pudo iniciar sesión. Inténtalo de nuevo.' : null)
  const [aviso, setAviso] = useState<string | null>(null)

  const callbackUrl = () => `${window.location.origin}/auth/callback`

  async function conProveedor(provider: Provider) {
    setError(null)
    setCargando(true)
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    })
    if (error) {
      setError(traducir(error.message))
      setCargando(false)
    }
  }

  async function conEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setCargando(true)
    const supabase = createClient()

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(traducir(error.message))
        setCargando(false)
        return
      }
      router.replace('/apuestas')
      router.refresh()
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    })
    setCargando(false)
    if (error) return setError(traducir(error.message))
    if (data.session) {
      router.replace('/apuestas')
      router.refresh()
    } else {
      setAviso('Te hemos enviado un email. Ábrelo y pulsa el enlace para activar tu cuenta.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {PROVEEDORES.map((p) => (
          <button
            key={p.id}
            onClick={() => conProveedor(p.id)}
            disabled={cargando}
            className="h-12 w-full rounded-xl border border-border bg-surface text-base font-semibold disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />o con tu email<span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={conEmail} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          placeholder={modo === 'entrar' ? 'Contraseña' : 'Contraseña (mínimo 8 caracteres)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {aviso && <p role="status" className="text-sm text-brand">{aviso}</p>}
        <button
          type="submit"
          disabled={cargando}
          className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground disabled:opacity-50"
        >
          {cargando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        {modo === 'entrar' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
        <button
          type="button"
          onClick={() => {
            setModo(modo === 'entrar' ? 'registro' : 'entrar')
            setError(null)
            setAviso(null)
          }}
          className="font-semibold text-brand"
        >
          {modo === 'entrar' ? 'Crear una' : 'Entrar'}
        </button>
      </p>
    </div>
  )
}

function traducir(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(mensaje)) return 'Falta confirmar tu email. Revisa tu bandeja de entrada.'
  if (/already registered/i.test(mensaje)) return 'Ya existe una cuenta con ese email.'
  if (/password/i.test(mensaje)) return 'La contraseña no es válida (mínimo 8 caracteres).'
  return 'Algo ha fallado. Inténtalo de nuevo.'
}
