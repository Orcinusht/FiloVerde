'use client'

import { useState } from 'react'

// Muestra la captura para comparar con el formulario. Al tocarla, pantalla completa
// (se puede ampliar con los dedos).
export function VisorCaptura({ ruta }: { ruta: string }) {
  const [grande, setGrande] = useState(false)
  const [fallo, setFallo] = useState(false)
  const src = `/api/capturas/ver?ruta=${encodeURIComponent(ruta)}`

  if (fallo) {
    return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No se ha podido cargar la captura.</p>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setGrande(true)}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-surface"
        aria-label="Ver la captura en grande"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por nuestra ruta */}
        <img src={src} alt="Captura de la apuesta" className="mx-auto max-h-72 w-auto object-contain" onError={() => setFallo(true)} />
        <span className="block border-t border-border py-1.5 text-xs text-muted">Toca para ampliar</span>
      </button>
      {grande && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-auto bg-black/95 pt-[env(safe-area-inset-top)]"
          onClick={() => setGrande(false)}
        >
          <button
            type="button"
            className="fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 h-11 rounded-full bg-white/15 px-4 text-sm font-semibold text-white"
          >
            Cerrar
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Captura de la apuesta" className="mx-auto w-full max-w-3xl" />
        </div>
      )}
    </>
  )
}
