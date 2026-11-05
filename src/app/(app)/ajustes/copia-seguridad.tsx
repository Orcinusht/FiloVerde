'use client'

import { useState } from 'react'

type Que = 'apuestas' | 'selecciones' | 'bankroll'
type Mensaje = { ok: boolean; texto: string }

// Ajustes → Copia de seguridad: descarga las apuestas y las selecciones en CSV (dos archivos
// separados: los móviles suelen bloquear varias descargas a la vez). El CSV lo prepara el
// servidor con la sesión; aquí solo se pide y se guarda.
export function CopiaSeguridad() {
  const [ocupado, setOcupado] = useState<Que | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  async function descargar(que: Que) {
    setOcupado(que)
    setMensaje(null)
    try {
      const res = await fetch(`/api/exportar/${que}`, { cache: 'no-store' })
      const tipo = res.headers.get('Content-Type') ?? ''
      if (!res.ok || !tipo.startsWith('text/csv')) {
        // Sin sesión, el proxy manda a /login (llega una página, no un CSV).
        if (res.redirected || tipo.startsWith('text/html')) {
          setMensaje({ ok: false, texto: 'Tu sesión ha caducado. Vuelve a entrar para descargar tu copia.' })
          return
        }
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
        setMensaje({ ok: false, texto: cuerpo?.error ?? 'No se ha podido descargar. Inténtalo de nuevo en un momento.' })
        return
      }
      const archivo = res.headers.get('X-Filoverde-Archivo') ?? `filoverde-${que}.csv`
      const filas = Number(res.headers.get('X-Filoverde-Filas') ?? 0)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = archivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      const [una, varias] = { apuestas: ['apuesta', 'apuestas'], selecciones: ['selección', 'selecciones'], bankroll: ['movimiento', 'movimientos'] }[que]
      const cuantas = filas === 1 ? `1 ${una}` : `${filas} ${varias}`
      setMensaje({ ok: true, texto: `Descargado ${archivo} (${cuantas}).` })
    } catch {
      setMensaje({ ok: false, texto: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' })
    } finally {
      setOcupado(null)
    }
  }

  const boton = (que: Que, texto: string) => (
    <button
      type="button"
      onClick={() => descargar(que)}
      disabled={ocupado !== null}
      className="h-12 w-full rounded-xl border border-border bg-surface text-sm font-semibold disabled:opacity-60"
    >
      {ocupado === que ? 'Preparando…' : texto}
    </button>
  )

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Copia de seguridad</h2>
      <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
        <p className="text-xs text-muted">
          Descarga todas tus apuestas y tus movimientos de bankroll en archivos CSV para Excel o Google Sheets.
          Guárdalos en un lugar seguro: el plan gratuito no hace copias automáticas.
        </p>
        {boton('apuestas', 'Descargar apuestas (CSV)')}
        {boton('selecciones', 'Descargar selecciones (CSV)')}
        {boton('bankroll', 'Descargar bankroll (CSV)')}
        {mensaje && (
          <p role="status" className={`text-sm ${mensaje.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {mensaje.texto}
          </p>
        )}
      </div>
    </section>
  )
}
