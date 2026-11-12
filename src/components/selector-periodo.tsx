'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  TIPOS_PERIODO,
  diaCorto,
  diaSemana,
  sumarDias,
  tramo,
  type CambiosPeriodo,
  type NavegacionPeriodo,
  type TipoPeriodo,
} from '@/lib/analisis/periodo'

// Selector de periodo "tipo + navegador" (diseño B, desde el 2026-11-12). Reutilizable: recibe la
// navegación ya calculada en el servidor (`navegacionPeriodo`) y escribe los cambios en la
// dirección (periodo, ref, desde, hasta), así se puede recargar o volver atrás sin perderlos.
// Cambiar el periodo vuelve a la primera página de las listas. De momento solo lo usa Análisis.

function useIr() {
  const router = useRouter()
  const sp = useSearchParams()
  const ruta = usePathname()
  return (c: CambiosPeriodo) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries({ ...c, pagina: '', mas: '' })) {
      if (v) q.set(k, v)
      else q.delete(k)
    }
    const s = q.toString()
    router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false })
  }
}

export function SelectorPeriodo({ nav, hoy }: { nav: NavegacionPeriodo; hoy: string }) {
  const ir = useIr()
  const [hoja, setHoja] = useState(false)
  const cerrar = useCallback(() => setHoja(false), []) // estable: la hoja no recoloca el foco al tocar días
  const flecha = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-2xl disabled:opacity-30'
  return (
    <div className="space-y-2" data-selector-periodo>
      <div role="group" aria-label="Tipo de periodo" className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface p-1">
        {(Object.entries(TIPOS_PERIODO) as [TipoPeriodo, string][]).map(([k, v]) => (
          <button
            key={k}
            type="button"
            data-tipo-periodo={k}
            aria-pressed={nav.tipo === k}
            onClick={() => ir(nav.tipos[k])}
            className={`h-11 min-w-0 rounded-lg text-sm font-medium ${nav.tipo === k ? 'bg-brand text-brand-foreground' : 'text-foreground'}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Periodo anterior"
          data-flecha="anterior"
          disabled={!nav.anterior}
          onClick={() => nav.anterior && ir(nav.anterior)}
          className={flecha}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="break-words text-base font-semibold leading-tight" data-periodo-titulo aria-live="polite">
            {nav.titulo}
          </p>
          {nav.volver && (
            <button
              type="button"
              data-volver-periodo
              onClick={() => ir(nav.volver!.cambios)}
              className="mt-0.5 inline-flex h-8 items-center text-sm font-semibold text-brand"
            >
              {nav.volver.texto}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Más periodos: atajos y rango personalizado"
          aria-haspopup="dialog"
          data-abrir-hoja
          onClick={() => setHoja(true)}
          className={`${flecha} text-xl`}
        >
          <span aria-hidden="true">⋯</span>
        </button>
        <button
          type="button"
          aria-label="Periodo siguiente"
          data-flecha="siguiente"
          disabled={!nav.siguiente}
          onClick={() => nav.siguiente && ir(nav.siguiente)}
          className={flecha}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {hoja && (
        <HojaPeriodo
          nav={nav}
          hoy={hoy}
          cerrar={cerrar}
          elegir={(c) => {
            setHoja(false)
            ir(c)
          }}
        />
      )}
    </div>
  )
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const CABECERA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const mesDe = (dia: string) => `${dia.slice(0, 7)}-01`
function otroMes(primero: string, n: number): string {
  const [y, m] = primero.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}

// Hoja inferior: atajos (Hoy, Ayer, Últimos 7 y 30 días) y rango personalizado con calendario
// (se toca el primer día y el último).
function HojaPeriodo({
  nav,
  hoy,
  cerrar,
  elegir,
}: {
  nav: NavegacionPeriodo
  hoy: string
  cerrar: () => void
  elegir: (c: CambiosPeriodo) => void
}) {
  const id = useId()
  const esPersonalizado = nav.tipo == null && !nav.atajos.some((a) => a.activo)
  const [inicio, setInicio] = useState(esPersonalizado ? nav.desdeDia : '')
  const [fin, setFin] = useState(esPersonalizado ? nav.hastaDia : '')
  const [mes, setMes] = useState(mesDe(inicio || nav.desdeDia || hoy))
  const botonCerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    botonCerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [cerrar])

  const tocar = (d: string) => {
    if (!inicio || fin) {
      setInicio(d)
      setFin('')
    } else if (d < inicio) {
      setInicio(d)
    } else {
      setFin(d)
    }
  }
  const hasta = fin || inicio
  const textoVer = !inicio ? 'Elige los días' : inicio === hasta ? `Ver solo el ${diaCorto(inicio, hoy)}` : `Ver ${tramo(inicio, hasta, hoy)}`

  // Rejilla del mes: huecos hasta el lunes y los días del mes.
  const huecos = diaSemana(mes) - 1
  const dias: string[] = []
  for (let d = mes; d.slice(0, 7) === mes.slice(0, 7); d = sumarDias(d, 1)) dias.push(d)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" data-hoja-periodo>
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={cerrar} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${id}-t`} className="text-base font-semibold">
            Periodo
          </h2>
          <button ref={botonCerrar} type="button" onClick={cerrar} className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            Cerrar
          </button>
        </div>

        <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Atajos</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {nav.atajos.map((a) => (
            <button
              key={a.clave}
              type="button"
              data-atajo={a.clave}
              aria-pressed={a.activo}
              onClick={() => elegir(a.cambios)}
              className={`h-11 rounded-xl border px-3 text-sm font-medium ${a.activo ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'}`}
            >
              {a.texto}
            </button>
          ))}
        </div>

        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Rango personalizado</h3>
        <p className="mt-1 text-xs text-muted">Toca el primer día y el último (los dos cuentan).</p>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" aria-label="Mes anterior" onClick={() => setMes(otroMes(mes, -1))} className="flex h-11 w-11 items-center justify-center text-2xl">
            <span aria-hidden="true">‹</span>
          </button>
          <p className="text-sm font-semibold" data-calendario-mes aria-live="polite">
            {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
          </p>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMes(otroMes(mes, 1))} className="flex h-11 w-11 items-center justify-center text-2xl">
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center" data-calendario>
          {CABECERA.map((c) => (
            <span key={c} aria-hidden="true" className="py-1 text-xs font-medium text-muted">
              {c}
            </span>
          ))}
          {Array.from({ length: huecos }, (_, i) => (
            <span key={`h${i}`} />
          ))}
          {dias.map((d) => {
            const extremo = d === inicio || d === hasta
            const dentro = inicio && d > inicio && d < hasta
            return (
              <button
                key={d}
                type="button"
                data-dia={d}
                aria-pressed={!!(extremo || dentro)}
                aria-label={diaCorto(d, hoy, true)}
                onClick={() => tocar(d)}
                className={`h-11 min-w-0 text-sm tabular-nums ${
                  extremo ? 'rounded-xl bg-brand font-semibold text-brand-foreground' : dentro ? 'bg-brand/15' : ''
                } ${d === hoy && !extremo ? 'font-bold underline' : ''}`}
              >
                {Number(d.slice(8, 10))}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          data-ver-rango
          disabled={!inicio}
          onClick={() => elegir({ periodo: 'personalizado', ref: '', desde: inicio, hasta })}
          className="mt-3 h-12 w-full rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-40"
        >
          {textoVer}
        </button>
      </div>
    </div>
  )
}
