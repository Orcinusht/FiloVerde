'use client'

import { useRef, useState } from 'react'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { marcasEje, puntoMasCercano, vecinos, type Tono } from '@/lib/graficas/geometria'

// Gráfica de línea propia (SVG, sin librerías). Una serie; eje de euros a la izquierda; línea del 0
// marcada; al tocar o arrastrar se elige el punto MÁS CERCANO al dedo (en horizontal y en vertical)
// y sale una etiqueta con su texto (también con las flechas del teclado). Si hay varios puntos casi
// pegados, la etiqueta dice cuál es ("2 de 3 aquí"). Color de la línea según el resultado (verde,
// rojo o neutro; el valor con signo se escribe al lado, el color nunca va solo). Puntos verdes
// (depósito) y rojos (retirada) opcionales. Eje horizontal y de euros compartibles entre gráficas.

export type PuntoGrafica = {
  x: number // posición horizontal (fecha en ms, día o índice)
  y: number // céntimos
  texto: string // etiqueta al tocar (fecha, valor y lo que pasó)
  deposito?: boolean
  retirada?: boolean
}

const corto = (c: number) => {
  const e = c / 100
  const txt =
    Math.abs(e) >= 10_000
      ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(e / 1000)} mil`
      : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(e)
  return `${txt} €`
}

const COLOR_LINEA: Record<Tono, string> = {
  positivo: 'stroke-green-600 dark:stroke-green-400',
  negativo: 'stroke-red-600 dark:stroke-red-400',
  neutro: 'stroke-foreground',
}

export function GraficaLinea({
  puntos,
  titulo,
  inicio,
  fin,
  conMarcas = false,
  id,
  tono = 'neutro',
  dominioX,
  dominioY,
  bajo = false,
}: {
  puntos: PuntoGrafica[]
  titulo: string // nombre accesible
  inicio: string // texto bajo el eje, a la izquierda
  fin: string // y a la derecha
  conMarcas?: boolean
  id: string // data-grafica (pruebas)
  tono?: Tono
  dominioX?: [number, number] // eje horizontal común (si no, el de sus puntos)
  dominioY?: [number, number] // "Misma escala": mínimo y máximo comunes en céntimos
  bajo?: boolean // más baja (cuadrícula de series)
}) {
  const [sel, setSel] = useState<{ i: number; aqui: string } | null>(null)
  const activo = sel?.i ?? null
  const caja = useRef<HTMLDivElement>(null)
  if (puntos.length === 0) return null
  const xs = puntos.map((p) => p.x)
  const ys = puntos.map((p) => p.y)
  const x0 = dominioX ? dominioX[0] : Math.min(...xs)
  const x1 = dominioX ? dominioX[1] : Math.max(...xs)
  const marcas = dominioY ? marcasEje(dominioY[0], dominioY[1]) : marcasEje(Math.min(...ys), Math.max(...ys))
  const yMin = marcas[0]
  const yMax = marcas[marcas.length - 1]
  const px = (x: number) => (x1 === x0 ? 50 : ((x - x0) / (x1 - x0)) * 100)
  const py = (y: number) => (yMax === yMin ? 50 : 100 - ((y - yMin) / (yMax - yMin)) * 100)
  const linea = puntos.map((p) => `${px(p.x).toFixed(3)},${py(p.y).toFixed(3)}`).join(' ')
  const ultimo = puntos[puntos.length - 1]
  const alto = bajo ? 'h-32' : 'h-44'

  // Posición de cada punto en píxeles de pantalla (para elegir el más cercano al dedo).
  const enPixeles = () => {
    const r = caja.current?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    return { r, pts: puntos.map((p) => ({ x: (px(p.x) / 100) * r.width, y: (py(p.y) / 100) * r.height })) }
  }
  // Elige el punto i y, si hay otros casi pegados en horizontal, dice cuál de ellos es.
  const setActivo = (i: number | null) => {
    if (i == null) return setSel(null)
    const g = enPixeles()
    const v = g ? vecinos(g.pts.map((q) => q.x), i) : { total: 1, posicion: 1 }
    setSel({ i, aqui: v.total > 1 ? `\n(${v.posicion} de ${v.total} aquí: desliza arriba o abajo, o usa las flechas)` : '' })
  }
  const elegir = (clientX: number, clientY: number) => {
    const g = enPixeles()
    if (!g) return
    const i = puntoMasCercano(g.pts, clientX - g.r.left, clientY - g.r.top)
    if (i >= 0) setActivo(i)
  }
  const p = activo == null ? null : puntos[activo]
  const aqui = sel?.aqui ?? ''

  return (
    <figure className="space-y-1" data-grafica={id} data-puntos={puntos.length} data-ultimo={ultimo.y} data-tono={tono}>
      <div className="flex">
        {/* Eje de euros */}
        <div className={`relative ${alto} w-14 shrink-0 text-[10px] tabular-nums text-muted`} aria-hidden="true">
          {marcas.map((m) => (
            <span key={m} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap" style={{ top: `${py(m)}%` }}>
              {corto(m)}
            </span>
          ))}
        </div>
        <div
          ref={caja}
          role="img"
          aria-label={`${titulo}. ${inicio}: ${formatoImporte(puntos[0].y)}. ${fin}.`}
          tabIndex={0}
          className={`relative ${alto} min-w-0 flex-1 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-brand`}
          onPointerDown={(e) => elegir(e.clientX, e.clientY)}
          onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons ? elegir(e.clientX, e.clientY) : undefined)}
          onPointerLeave={(e) => (e.pointerType === 'mouse' ? setActivo(null) : undefined)}
          onBlur={() => setActivo(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              const d = e.key === 'ArrowRight' ? 1 : -1
              setActivo(Math.min(puntos.length - 1, Math.max(0, (activo ?? (d > 0 ? -1 : puntos.length)) + d)))
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
            <polyline
              points={linea}
              fill="none"
              className={COLOR_LINEA[tono]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Final de la línea: un punto (con una sola apuesta, se ve aunque no haya trazo). */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              tono === 'positivo' ? 'bg-green-600 dark:bg-green-400' : tono === 'negativo' ? 'bg-red-600 dark:bg-red-400' : 'bg-foreground'
            }`}
            style={{ left: `${px(ultimo.x)}%`, top: `${py(ultimo.y)}%` }}
          />
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
                className="pointer-events-none absolute top-0 z-10 max-w-[80%] whitespace-pre-line rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-sm"
                style={px(p.x) > 50 ? { right: `${100 - px(p.x) + 2}%` } : { left: `${px(p.x) + 2}%` }}
              >
                {p.texto}
                {aqui}
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption className="flex justify-between gap-2 pl-14 text-[11px] text-muted">
        <span>{inicio}</span>
        <span className="text-right">{fin}</span>
      </figcaption>
    </figure>
  )
}
