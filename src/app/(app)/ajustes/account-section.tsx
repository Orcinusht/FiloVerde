'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AccountSection() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function cerrarSesion() {
    setSaliendo(true)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Cuenta</h2>
      <div className="rounded-xl border border-border bg-surface">
        <p className="truncate px-4 py-3 text-sm">
          <span className="text-muted">Sesión iniciada como </span>
          {email ?? '…'}
        </p>
        <button
          onClick={cerrarSesion}
          disabled={saliendo}
          className="h-12 w-full border-t border-border text-sm font-semibold text-red-600 dark:text-red-400 disabled:opacity-50"
        >
          {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </section>
  )
}
