'use client'

import { useRef, useState } from 'react'
import { formatoImporte } from '@/lib/apuestas/dinero'

// Gráfica de línea propia (SVG, sin librerías). Una serie; eje de euros a la izquierda; línea del 0
// marcada; al tocar o arrastrar, línea vertical y una etiqueta con la fecha y el valor (también con
// las flechas del teclado). Puntos verdes (depósito) y rojos (retirada) opcionales.

export type PuntoGrafica = {
  x: number // posición horizontal (índice de apuesta o día)
  y: number // céntimos
  texto: string // texto de la etiqueta al tocar (fecha, valor y lo que pasó ese día)
  deposito?: boolean
  retirada?: boolean
}

// Marcas del eje: entre 3 y 6 valores "redondos" que incluyen el 0.
function marcasEje(min: number, max: number): number[] {
  if (min === max) {
    const d = Math.max(100, Math.abs(min))
    min = Math.min(0, min - d)
    max = Math.max(0, max + d)
  }
  const bruto = (max - min) / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot
  const marcas: number[] = []
  for (let v = Math.floor(min / paso) * paso; v <= max + paso * 0.001; v += paso) marcas.push(Math.round(v))
  if (marcas[marcas.length - 1] < max) marcas.push(marcas[marcas.length - 1] + paso)
  return marcas
}

const corto = (c: number) => {
  const e = c / 100
  const abs = Math.abs(e)
  const txt = abs >= 10_000 ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(e / 1000)} mil` : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(e)
  return `${txt} €`
}

export function GraficaLinea({
  puntos,
  titulo,
  inicio,
  fin,
  conMarcas = false,
  id,
}: {
  puntos: PuntoGrafica[]
  titulo: string // nombre accesible
  inicio: string // texto bajo el eje, a la izquierda
  fin: string // y a la derecha
  conMarcas?: boolean
  id: string // data-grafica (pruebas)
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  if (puntos.length === 0) return null
  const xs = puntos.map((p) => p.x)
  const ys = puntos.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const marcas = marcasEje(Math.min(0, ...ys), Math.max(0, ...ys))
  const yMin = marcas[0]
  const yMax = marcas[marcas.length - 1]
  const px = (x: number) => (x1 === x0 ? 50 : ((x - x0) / (x1 - x0)) * 100)
  const py = (y: number) => (yMax === yMin ? 50 : 100 - ((y - yMin) / (yMax - yMin)) * 100)
  const linea = puntos.map((p) => `${px(p.x).toFixed(3)},${py(p.y).toFixed(3)}`).join(' ')
  const ultimo = puntos[puntos.length - 1]

  const elegir = (clientX: number) => {
    const r = caja.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const rel = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100
    let mejor = 0
    for (let i = 1; i < puntos.length; i++) if (Math.abs(px(puntos[i].x) - rel) < Math.abs(px(puntos[mejor].x) - rel)) mejor = i
    setActivo(mejor)
  }
  const p = activo == null ? null : puntos[activo]

  return (
    <figure className="space-y-1" data-grafica={id} data-puntos={puntos.length} data-ultimo={ultimo.y}>
      <div className="flex">
        {/* Eje de euros */}
        <div className="relative h-44 w-14 shrink-0 text-[10px] tabular-nums text-muted" aria-hidden="true">
          {marcas.map((m) => (
            <span key={m} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap" style={{ top: `${py(m)}%` }}>
              {corto(m)}
            </span>
          ))}
        </div>
        <div
          ref={caja}
          role="img"
          aria-label={`${titulo}. ${inicio}: ${formatoImporte(puntos[0].y)}. ${fin}: ${formatoImporte(ultimo.y)}.`}
          tabIndex={0}
          className="relative h-44 min-w-0 flex-1 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onPointerDown={(e) => elegir(e.clientX)}
          onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons ? elegir(e.clientX) : undefined)}
          onPointerLeave={(e) => (e.pointerType === 'mouse' ? setActivo(null) : undefined)}
          onBlur={() => setActivo(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              const d = e.key === 'ArrowRight' ? 1 : -1
              setActivo((a) => Math.min(puntos.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : puntos.length)) + d)))
            } else if (e.key === 'Escape') setActivo(null)
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {marcas.map((m) => (
              <line
                key={m}
                x1="0"
                x2="100"
                y1={py(m)}
                y2={py(m)}
                stroke="var(--border)"
                strokeWidth={m === 0 ? 1.5 : 1}
                strokeDasharray={m === 0 ? undefined : '3 3'}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {p && <line x1={px(p.x)} x2={px(p.x)} y1="0" y2="100" stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            <polyline points={linea} fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Puntos HTML: siempre redondos aunque el SVG se estire */}
          {conMarcas &&
            puntos.map((q, i) =>
              q.deposito || q.retirada ? (
                <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${px(q.x)}%`, top: `${py(q.y)}%` }}>
                  <span className="flex flex-col gap-0.5">
                    {q.deposito && <span data-marca="deposito" className="block h-2.5 w-2.5 rounded-full bg-green-600 ring-2 ring-surface dark:bg-green-400" />}
                    {q.retirada && <span data-marca="retirada" className="block h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-surface dark:bg-red-400" />}
                  </span>
                </span>
              ) : null,
            )}
          {p && (
            <>
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-surface"
                style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%` }}
              />
              <div
                role="status"
                data-etiqueta-grafica=""
                className="pointer-events-none absolute top-0 z-10 max-w-[75%] whitespace-pre-line rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-sm"
                style={px(p.x) > 50 ? { right: `${100 - px(p.x) + 2}%` } : { left: `${px(p.x) + 2}%` }}
              >
                {p.texto}
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption className="flex justify-between pl-14 text-[11px] text-muted">
        <span>{inicio}</span>
        <span>{fin}</span>
      </figcaption>
    </figure>
  )
}
