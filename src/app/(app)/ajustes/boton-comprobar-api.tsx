'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// "Comprobar": pregunta a API-Football (/status) el plan y las llamadas de hoy.
export function BotonComprobarApi() {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  return (
    <div className="space-y-2 border-t border-border px-4 py-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setMensaje(null)
            const r = await fetch('/api/futbol/comprobar', { method: 'POST' })
              .then((x) => x.json())
              .catch(() => ({ ok: false, error: 'No se ha podido comprobar. Revisa la conexión.' }))
            if (!r.ok) return setMensaje({ error: true, texto: r.error ?? 'No se ha podido comprobar.' })
            const n = (k: number) => new Intl.NumberFormat('es-ES').format(k)
            setMensaje({
              error: false,
              texto: `Funciona${r.estado.plan ? ` · plan ${r.estado.plan}` : ''} · hoy ${n(r.estado.usadas)} de ${n(r.estado.limite)} llamadas usadas en la cuenta.`,
            })
            router.refresh()
          })
        }
        className="h-11 w-full rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
      >
        {pendiente ? 'Comprobando…' : 'Comprobar conexión'}
      </button>
      {mensaje && (
        <p role="status" className={`text-sm ${mensaje.error ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}
