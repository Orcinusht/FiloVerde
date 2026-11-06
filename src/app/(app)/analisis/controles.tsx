'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// Controles de Análisis, Gráficas y Bankroll (filtro de periodo, desplegables y conmutadores). Todo se guarda en la dirección (se puede recargar o volver
// atrás sin perderlo) y el servidor recalcula con lo elegido.

function useIr() {
  const router = useRouter()
  const sp = useSearchParams()
  const ruta = usePathname()
  return (cambios: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v)
      else q.delete(k)
    }
    const s = q.toString()
    router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false })
  }
}

const clase = 'h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm'

// Filtro de periodo, el mismo en Análisis, su detalle, Gráficas y Bankroll: una fila de fichas con
// desplazamiento horizontal (un toque para cambiar; la elegida en verde). "Personalizado" abre
// Desde / Hasta. Cambiar el periodo vuelve a la primera página de las listas.
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
  const fila = useRef<HTMLDivElement>(null)
  // Que la ficha elegida se vea (sin mover la página en vertical).
  useEffect(() => {
    const f = fila.current
    const b = f?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (f && b) f.scrollLeft = Math.max(0, b.offsetLeft - (f.clientWidth - b.offsetWidth) / 2)
  }, [periodo])
  const elegir = (v: string) =>
    ir({ periodo: v === 'todo' ? '' : v, desde: v === 'personalizado' ? d : '', hasta: v === 'personalizado' ? h : '', pagina: '', mas: '' })
  return (
    <div className="space-y-2">
      <div
        ref={fila}
        role="group"
        aria-label="Periodo"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Object.entries(periodos).map(([k, v]) => (
          <button
            key={k}
            type="button"
            data-periodo={k}
            aria-pressed={periodo === k}
            onClick={() => elegir(k)}
            className={`h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium ${
              periodo === k ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {periodo === 'personalizado' && (
        <form
          className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ir({ periodo: 'personalizado', desde: d, hasta: h, pagina: '', mas: '' })
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
    <select aria-label={etiqueta} value={valor} onChange={(e) => ir({ [nombre]: e.target.value, mas: '' })} className={clase}>
      {opciones.map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  )
}

// Dos o tres opciones excluyentes como botones (p. ej. "Escala propia / Misma escala").
export function Conmutador({ nombre, etiqueta, valor, opciones }: { nombre: string; etiqueta: string; valor: string; opciones: [string, string][] }) {
  const ir = useIr()
  return (
    <div role="group" aria-label={etiqueta} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-border bg-surface p-1">
      {opciones.map(([k, v], i) => (
        <button
          key={k}
          type="button"
          aria-pressed={valor === k}
          // La primera opción es la de por defecto: no se escribe en la dirección.
          onClick={() => ir({ [nombre]: i === 0 ? '' : k })}
          className={`h-9 min-w-0 truncate rounded-lg px-2 text-sm font-medium ${valor === k ? 'bg-brand text-brand-foreground' : 'text-muted'}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
