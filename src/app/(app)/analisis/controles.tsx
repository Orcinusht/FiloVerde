'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

// Controles de la pantalla Análisis. Todo se guarda en la dirección (se puede recargar o volver
// atrás sin perderlo) y el servidor recalcula con lo elegido.

function useIr() {
  const router = useRouter()
  const sp = useSearchParams()
  return (cambios: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v)
      else q.delete(k)
    }
    const s = q.toString()
    router.replace(s ? `/analisis?${s}` : '/analisis', { scroll: false })
  }
}

const clase = 'h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm'

export function FiltroFechas({
  periodo,
  desde,
  hasta,
  periodos,
}: {
  periodo: string
  desde: string
  hasta: string
  periodos: Record<string, string>
}) {
  const ir = useIr()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  return (
    <div className="space-y-2">
      <select
        aria-label="Periodo"
        value={periodo}
        onChange={(e) =>
          ir({ periodo: e.target.value === 'todo' ? '' : e.target.value, desde: e.target.value === 'personalizado' ? d : '', hasta: e.target.value === 'personalizado' ? h : '' })
        }
        className={clase}
      >
        {Object.entries(periodos).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {periodo === 'personalizado' && (
        <form
          className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ir({ periodo: 'personalizado', desde: d, hasta: h })
          }}
        >
          <label className="min-w-0 text-xs text-muted">
            Desde
            <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={`${clase} mt-1 appearance-none`} />
          </label>
          <label className="min-w-0 text-xs text-muted">
            Hasta
            <input type="date" value={h} onChange={(e) => setH(e.target.value)} className={`${clase} mt-1 appearance-none`} />
          </label>
          <button type="submit" className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground">
            Ver
          </button>
        </form>
      )}
    </div>
  )
}

export function Selector({
  nombre,
  etiqueta,
  valor,
  opciones,
}: {
  nombre: string
  etiqueta: string
  valor: string
  opciones: [string, string][]
}) {
  const ir = useIr()
  return (
    <select aria-label={etiqueta} value={valor} onChange={(e) => ir({ [nombre]: e.target.value })} className={clase}>
      {opciones.map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  )
}
