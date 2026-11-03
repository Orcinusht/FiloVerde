'use client'

import { useEffect, useState } from 'react'
import { recordarScroll, tomarAviso, tomarScroll } from '@/lib/navegador/volver-a-lista'

// En la lista: muestra el aviso "Apuesta guardada/borrada" (2,5 s), recupera la posición de
// scroll al volver del detalle y la recuerda al abrir una apuesta.
export function VueltaALista() {
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const url = window.location.pathname + window.location.search
    const texto = tomarAviso()
    const y = tomarScroll(url)

    // La lista carga por partes y la app puede mover la pantalla al llegar: durante 1,5 s se
    // mantiene la posición. Si el usuario mueve la pantalla, se deja de insistir.
    let restaurar: ReturnType<typeof setInterval> | undefined
    const parar = () => {
      if (restaurar) clearInterval(restaurar)
      restaurar = undefined
    }
    if (y != null) {
      const inicio = Date.now()
      const fijar = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max >= y - 2 && Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y })
        if (Date.now() - inicio > 1500) parar()
      }
      fijar()
      restaurar = setInterval(fijar, 50)
      window.addEventListener('touchmove', parar, { once: true, passive: true })
      window.addEventListener('wheel', parar, { once: true, passive: true })
    }

    let t: ReturnType<typeof setTimeout> | undefined
    if (texto) t = setTimeout(() => setAviso(texto), 0)

    const alPulsar = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a[href^="/apuestas/"]')
      if (a) recordarScroll(window.location.pathname + window.location.search, window.scrollY)
    }
    document.addEventListener('click', alPulsar, true)
    return () => {
      document.removeEventListener('click', alPulsar, true)
      window.removeEventListener('touchmove', parar)
      window.removeEventListener('wheel', parar)
      parar()
      if (t) clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 2500)
    return () => clearTimeout(t)
  }, [aviso])

  if (!aviso) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4"
    >
      <p className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        ✓ {aviso}
      </p>
    </div>
  )
}
