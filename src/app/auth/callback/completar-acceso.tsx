'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { iniciarConTokens, intercambiarCodigo } from './actions'

export function CompletarAcceso() {
  const router = useRouter()
  const hecho = useRef(false)

  useEffect(() => {
    if (hecho.current) return
    hecho.current = true

    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    // Quitamos los tokens de la barra de direcciones y del historial.
    window.history.replaceState(null, '', window.location.pathname)

    const fallo = (codigo: string) => router.replace(`/login?error=${codigo}`)

    const codigoError = hash.get('error_code') ?? query.get('error_code')
    if (codigoError) {
      console.warn('[auth:callback]', codigoError)
      return fallo(codigoError === 'otp_expired' ? 'enlace' : 'auth')
    }

    const code = query.get('code')
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')

    const intento = code
      ? intercambiarCodigo(code)
      : accessToken && refreshToken
        ? iniciarConTokens(accessToken, refreshToken)
        : Promise.resolve(false as const)

    // Si sale bien, la acción redirige sola a /apuestas.
    intento.then((r) => r === false && fallo('auth')).catch(() => fallo('auth'))
  }, [router])

  return null
}
