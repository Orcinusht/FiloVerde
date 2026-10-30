'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Provider } from '@supabase/supabase-js'
import { crearCuenta, entrarConEmail, entrarConProveedor, type Resultado } from './actions'
import { PROVEEDORES } from './providers'

type Modo = 'entrar' | 'registro'

const input =
  'h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand'

export function LoginForm() {
  const params = useSearchParams()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(errorInicial(params.get('error')))
  const [aviso, setAviso] = useState<string | null>(null)

  // Ejecuta una acción de servidor y muestra su resultado.
  // Si todo va bien, la acción redirige ella sola a la app (dentro de la
  // transición, Next.js gestiona esa redirección sin tratarla como error).
  function ejecutar(accion: () => Promise<Resultado>) {
    setError(null)
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await accion()
        setError(r?.error ?? null)
        setAviso(r?.aviso ?? null)
      } catch (e) {
        if (esRedireccion(e)) throw e
        setError('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.')
      }
    })
  }

  function conProveedor(provider: Provider) {
    ejecutar(() => entrarConProveedor(provider))
  }

  function conEmail(e: React.FormEvent) {
    e.preventDefault()
    ejecutar(() => (modo === 'entrar' ? entrarConEmail(email, password) : crearCuenta(email, password)))
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

// Mensaje al volver de un enlace o de Google con error (?error=...).
function errorInicial(codigo: string | null): string | null {
  if (codigo === 'enlace')
    return 'El enlace ha caducado o ya se usó. Si ya confirmaste tu email, entra con tu email y contraseña.'
  if (codigo) return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  return null
}

// Las redirecciones de Next.js viajan como un error especial; no son fallos.
function esRedireccion(e: unknown): boolean {
  return typeof e === 'object' && e !== null && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
}
