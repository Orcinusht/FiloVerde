'use client'

import { useState, useTransition } from 'react'
import { crearCasa, crearEstrategia, recuperarOpcion } from '@/app/(app)/apuestas/actions'
import type { Opcion } from '@/lib/apuestas/formulario'
import { useIdCampo } from './id-campo'

const NUEVA = '__nueva__'

// Desplegable de casas o estrategias con opción de crear una nueva al momento. Las ARCHIVADAS no
// salen, salvo la que ya esté elegida (apuesta antigua o casa leída por la IA): esa se ve con
// "(archivada)" y un botón para recuperarla.
export function SelectorOpcion({
  tipo,
  opciones,
  valor,
  sugerencia,
  onCambio,
  onCreada,
  vacio,
  etiqueta,
}: {
  tipo: 'casa' | 'estrategia'
  opciones: Opcion[]
  valor: string
  sugerencia?: string | null
  onCambio: (id: string) => void
  onCreada: (o: Opcion) => void
  vacio?: string // texto de la opción vacía (por defecto "Sin casa" / "Sin estrategia")
  etiqueta?: string // aria-label si no hay <label> asociada
}) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const { id } = useIdCampo()
  const [recuperadas, setRecuperadas] = useState<Set<string>>(new Set())
  const lista = opciones.map((o) => (recuperadas.has(o.id) ? { ...o, archivada: false } : o))
  const visibles = lista.filter((o) => !o.archivada || o.id === valor)
  const elegidaArchivada = lista.find((o) => o.id === valor && o.archivada)

  function recuperar(o: Opcion) {
    setError(null)
    iniciar(async () => {
      const r = await recuperarOpcion(tipo, o.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setRecuperadas((s) => new Set(s).add(o.id))
    })
  }

  function crear(n: string) {
    setError(null)
    iniciar(async () => {
      const r = tipo === 'casa' ? await crearCasa(n) : await crearEstrategia(n)
      if (!r.ok) {
        setError(r.error)
        return
      }
      onCreada(r.opcion)
      setCreando(false)
      setNombre('')
    })
  }

  const clase =
    'h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-brand/40'

  return (
    <div className="space-y-2">
      {!creando ? (
        <select
          id={id}
          aria-label={etiqueta}
          value={valor}
          onChange={(e) => {
            if (e.target.value === NUEVA) {
              setCreando(true)
              setNombre(sugerencia ?? '')
            } else onCambio(e.target.value)
          }}
          className={clase}
        >
          <option value="">{vacio ?? (tipo === 'casa' ? 'Sin casa' : 'Sin estrategia')}</option>
          {visibles.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
              {o.archivada ? ' (archivada)' : ''}
            </option>
          ))}
          <option value={NUEVA}>+ {tipo === 'casa' ? 'Nueva casa…' : 'Nueva estrategia…'}</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            id={id}
            autoFocus
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (nombre.trim()) crear(nombre)
              }
            }}
            placeholder={tipo === 'casa' ? 'Nombre de la casa' : 'Nombre de la estrategia'}
            className={clase}
          />
          <button
            type="button"
            disabled={pendiente || !nombre.trim()}
            onClick={() => crear(nombre)}
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
      {!creando && !valor && sugerencia && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => crear(sugerencia)}
          className="min-h-11 w-full rounded-xl border border-dashed border-brand px-3 py-2 text-left text-sm text-brand"
        >
          La IA ha leído «{sugerencia}». <strong>Crear y usar</strong>
        </button>
      )}
      {!creando && elegidaArchivada && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" role="status">
          <span className="min-w-0">
            «{elegidaArchivada.nombre}» está archivada (no sale para apuestas nuevas).
          </span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => recuperar(elegidaArchivada)}
            className="h-11 shrink-0 rounded-xl border border-amber-600/50 px-3 font-semibold disabled:opacity-50"
          >
            {pendiente ? '…' : 'Recuperar'}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
