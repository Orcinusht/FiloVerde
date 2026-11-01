'use client'

import { useState, useTransition } from 'react'
import { crearCasa, crearEstrategia } from '@/app/(app)/apuestas/actions'
import type { Opcion } from '@/lib/apuestas/formulario'
import { useIdCampo } from './id-campo'

const NUEVA = '__nueva__'

// Desplegable de casas o estrategias con opción de crear una nueva al momento.
export function SelectorOpcion({
  tipo,
  opciones,
  valor,
  sugerencia,
  onCambio,
  onCreada,
}: {
  tipo: 'casa' | 'estrategia'
  opciones: Opcion[]
  valor: string
  sugerencia?: string | null
  onCambio: (id: string) => void
  onCreada: (o: Opcion) => void
}) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const { id } = useIdCampo()

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
          value={valor}
          onChange={(e) => {
            if (e.target.value === NUEVA) {
              setCreando(true)
              setNombre(sugerencia ?? '')
            } else onCambio(e.target.value)
          }}
          className={clase}
        >
          <option value="">{tipo === 'casa' ? 'Sin casa' : 'Sin estrategia'}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
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
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
