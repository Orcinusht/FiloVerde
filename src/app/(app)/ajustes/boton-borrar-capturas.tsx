'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { borrarCapturas } from './capturas-actions'

export function BotonBorrarCapturas({ total, tamano }: { total: number; tamano: string }) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  if (total === 0) {
    return (
      <p className="text-sm text-muted" role="status">
        {mensaje?.texto ?? 'No hay capturas antiguas que borrar.'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {!confirmar ? (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="h-12 w-full rounded-xl border border-red-500/40 text-sm font-semibold text-red-600 dark:text-red-400"
        >
          Borrar {total} {total === 1 ? 'captura' : 'capturas'} ({tamano})
        </button>
      ) : (
        <div role="alertdialog" className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
          <p className="text-sm">
            Se borrarán {total} {total === 1 ? 'imagen' : 'imágenes'} de Storage. Tus apuestas y su coste se conservan.
            <strong> No se puede deshacer.</strong> Las pendientes de revisar no se tocan.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmar(false)} className="h-12 rounded-xl border border-border text-sm font-semibold">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await borrarCapturas()
                  setMensaje({ ok: r.ok, texto: r.mensaje })
                  setConfirmar(false)
                  router.refresh()
                })
              }
              className="h-12 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pendiente ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </div>
      )}
      {mensaje && (
        <p role="status" className={`text-sm ${mensaje.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}
