'use client'

import { useEffect } from 'react'

// Al abrir la lista, pide al servidor que reintente borrar capturas cuyo borrado falló.
// No espera respuesta ni muestra nada.
export function ReintentoSilencioso() {
  useEffect(() => {
    fetch('/api/capturas/reintentar', { method: 'POST', keepalive: true }).catch(() => {})
  }, [])
  return null
}
