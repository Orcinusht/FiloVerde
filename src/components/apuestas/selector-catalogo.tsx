'use client'

import { useState, useTransition } from 'react'
import { normalizar } from '@/lib/apuestas/catalogo'
import { useIdCampo } from './id-campo'

const NUEVO = '__nuevo__'

type Creacion = { ok: true; nombre: string; aviso?: string } | { ok: false; error: string }

// Desplegable de deporte o liga del catálogo, con "+ Nuevo…" para crear al momento.
// Si el valor actual no está en el catálogo (lo leyó la IA o es una apuesta antigua),
// se muestra tal cual y se ofrece "Crear y usar" / "Añadir al catálogo".
export function SelectorCatalogo({
  valor,
  opciones,
  vacio,
  textoNuevo,
  marcado,
  conError,
  esNueva,
  deshabilitado,
  ayudaDeshabilitado,
  crear,
  onCambio,
  emoji,
  archivada,
  recuperar,
}: {
  emoji?: (nombre: string) => string // decoración delante de cada opción (p. ej. deporte)
  valor: string
  opciones: string[]
  vacio: string // texto de la opción vacía ("Elige el deporte")
  textoNuevo: string // "+ Nuevo deporte…"
  marcado?: boolean
  conError?: boolean
  esNueva?: boolean // la IA lo propuso y no está en el catálogo
  deshabilitado?: boolean
  ayudaDeshabilitado?: string
  crear: (nombre: string) => Promise<Creacion>
  onCambio: (nombre: string) => void
  // El valor elegido está ARCHIVADO (lo leyó la IA o es una apuesta antigua): se muestra con
  // «(archivada)» y un botón para recuperarlo. `opciones` ya trae solo las no archivadas + esta.
  archivada?: boolean
  recuperar?: () => Promise<{ ok: boolean; error?: string }>
}) {
  const { id, descripcion } = useIdCampo()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [recuperada, setRecuperada] = useState(false)
  const esArchivada = !!archivada && !recuperada

  const enCatalogo = opciones.some((o) => normalizar(o) === normalizar(valor))
  const fuera = valor.trim() !== '' && !enCatalogo

  function hacerCrear(n: string) {
    setMensaje(null)
    iniciar(async () => {
      const r = await crear(n)
      if (!r.ok) {
        setMensaje({ error: true, texto: r.error })
        return
      }
      setCreando(false)
      setNombre('')
      if (r.aviso) setMensaje({ error: false, texto: r.aviso })
      onCambio(r.nombre)
    })
  }

  const clase = `h-12 w-full min-w-0 rounded-xl border px-3 text-base outline-none focus:ring-2 focus:ring-brand/40 ${
    conError ? 'border-red-500 bg-red-500/5' : marcado ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-background'
  } disabled:opacity-60`

  return (
    <div className="min-w-0 space-y-2">
      {!creando ? (
        <select
          id={id}
          aria-describedby={descripcion}
          value={fuera ? valor : (opciones.find((o) => normalizar(o) === normalizar(valor)) ?? '')}
          disabled={deshabilitado && !fuera}
          onChange={(e) => {
            if (e.target.value === NUEVO) {
              setCreando(true)
              setNombre('')
            } else onCambio(e.target.value)
          }}
          className={clase}
        >
          <option value="">{deshabilitado && !fuera ? (ayudaDeshabilitado ?? vacio) : vacio}</option>
          {fuera && <option value={valor}>{valor} (no está en tu catálogo)</option>}
          {opciones.map((o) => (
            <option key={o} value={o} aria-label={emoji ? o : undefined}>
              {emoji?.(o) ? `${emoji(o)} ${o}` : o}
              {esArchivada && normalizar(o) === normalizar(valor) ? ' (archivada)' : ''}
            </option>
          ))}
          {!deshabilitado && <option value={NUEVO}>{textoNuevo}</option>}
        </select>
      ) : (
        <div className="flex min-w-0 gap-2">
          <input
            id={id}
            autoFocus
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (nombre.trim()) hacerCrear(nombre)
              }
            }}
            placeholder="Nombre"
            className={clase}
          />
          <button
            type="button"
            disabled={pendiente || !nombre.trim()}
            onClick={() => hacerCrear(nombre)}
            className="h-12 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {pendiente ? '…' : 'Crear'}
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            className="h-12 shrink-0 rounded-xl border border-border px-3 text-sm"
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      )}
      {!creando && fuera && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => hacerCrear(valor)}
          className="min-h-11 w-full rounded-xl border border-dashed border-brand px-3 py-2 text-left text-sm text-brand"
        >
          {esNueva ? (
            <>
              La IA ha leído «{valor}». <strong>Crear y usar</strong>
            </>
          ) : (
            <>
              «{valor}» no está en tu catálogo. <strong>Añadir al catálogo</strong>
            </>
          )}
        </button>
      )}
      {mensaje && (
        <p className={`text-sm ${mensaje.error ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>{mensaje.texto}</p>
      )}
      {!creando && esArchivada && recuperar && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <span className="min-w-0">«{valor}» está archivada (no sale en las apuestas nuevas).</span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await recuperar()
                if (r.ok) setRecuperada(true)
                else setMensaje({ error: true, texto: r.error ?? 'No se ha podido recuperar.' })
              })
            }
            className="h-11 shrink-0 rounded-xl border border-amber-600/50 px-3 font-semibold disabled:opacity-50"
          >
            {pendiente ? '…' : 'Recuperar'}
          </button>
        </div>
      )}
    </div>
  )
}
