'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SelectorOpcion } from '@/components/apuestas/selector-opcion'
import { textoACentimos, centimosATexto } from '@/lib/apuestas/dinero'
import { NOMBRE_MOVIMIENTO, TIPOS_MOVIMIENTO, type TipoMovimiento } from '@/lib/bankroll/calculos'
import type { Opcion } from '@/lib/apuestas/formulario'
import { borrarMovimiento, guardarMovimiento } from './actions'

export type ValoresMovimiento = {
  tipo: TipoMovimiento
  dia: string // AAAA-MM-DD (España)
  importe: number | null // céntimos con signo
  casa_id: string
  casa_destino_id: string
  notas: string
}

// Formulario de alta y edición de un movimiento de bankroll. La IA no interviene. El servidor
// vuelve a validar todo (y la base de datos también lo impide).
export function FormularioMovimiento({
  id,
  inicial,
  casas: casasIniciales,
  hoy,
  volver,
}: {
  id: string | null
  inicial: ValoresMovimiento
  casas: Opcion[]
  hoy: string
  volver: string
}) {
  const router = useRouter()
  const [casas, setCasas] = useState(casasIniciales)
  const [tipo, setTipo] = useState<TipoMovimiento>(inicial.tipo)
  const [dia, setDia] = useState(inicial.dia)
  const [importe, setImporte] = useState(inicial.importe == null ? '' : centimosATexto(Math.abs(inicial.importe)))
  const [signo, setSigno] = useState<'+' | '-'>(inicial.importe != null && inicial.importe < 0 ? '-' : '+')
  const [casa, setCasa] = useState(inicial.casa_id)
  const [destino, setDestino] = useState(inicial.casa_destino_id)
  const [notas, setNotas] = useState(inicial.notas)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [pendiente, iniciar] = useTransition()

  const creada = (o: Opcion) => setCasas((l) => (l.some((x) => x.id === o.id) ? l : [...l, o].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))

  function salir() {
    router.replace(volver, { scroll: false })
    router.refresh()
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cent = textoACentimos(importe)
    const locales: Record<string, string> = {}
    if (cent == null || cent === undefined || cent <= 0) locales.importe = 'Escribe un importe mayor que 0.'
    if (!casa) locales.casa_id = 'Elige una casa.'
    if (tipo === 'traspaso' && !destino) locales.casa_destino_id = 'Elige la casa de destino.'
    if (tipo === 'traspaso' && destino && destino === casa) locales.casa_destino_id = 'La casa de destino debe ser distinta de la de origen.'
    if (!dia) locales.fecha = 'Indica un día.'
    else if (dia > hoy) locales.fecha = 'La fecha no puede ser futura: registra el movimiento cuando se haga.'
    setErrores(locales)
    if (Object.keys(locales).length) return
    iniciar(async () => {
      const r = await guardarMovimiento(id, {
        tipo,
        dia,
        importe: cent as number,
        signo,
        casa_id: casa,
        casa_destino_id: tipo === 'traspaso' ? destino : null,
        notas,
      })
      if (!r.ok) {
        setError(r.error)
        setErrores((r.errores as Record<string, string>) ?? {})
        return
      }
      salir()
    })
  }

  function borrar() {
    if (!id) return
    setError(null)
    iniciar(async () => {
      const r = await borrarMovimiento(id)
      if (!r.ok) {
        setError(r.error ?? 'No se ha podido borrar.')
        setConfirmarBorrado(false)
        return
      }
      salir()
    })
  }

  const clase = 'h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-brand/40'
  const errorCampo = (k: string) =>
    errores[k] ? (
      <p id={`err-${k}`} className="text-sm text-red-600 dark:text-red-400">
        {errores[k]}
      </p>
    ) : null

  return (
    <form onSubmit={guardar} className="space-y-4 px-4 pb-8 pt-2" noValidate>
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_MOVIMIENTO.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => setTipo(t)}
              className={`h-12 rounded-xl border text-sm font-semibold ${tipo === t ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'}`}
            >
              {NOMBRE_MOVIMIENTO[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {tipo === 'deposito' && 'Dinero que metes en la casa.'}
          {tipo === 'retirada' && 'Dinero que sacas de la casa.'}
          {tipo === 'ajuste' && 'Para cuadrar el saldo con el de la casa (bonos, comisiones…). Puede sumar o restar.'}
          {tipo === 'traspaso' && 'Dinero que pasas de una casa a otra. No cambia el saldo global.'}
        </p>
      </fieldset>

      <label className="block min-w-0 space-y-1">
        <span className="text-sm font-medium">Día</span>
        <input
          type="date"
          value={dia}
          max={hoy}
          onChange={(e) => setDia(e.target.value)}
          aria-invalid={Boolean(errores.fecha)}
          aria-describedby={errores.fecha ? 'err-fecha' : undefined}
          className={`${clase} appearance-none`}
        />
        {errorCampo('fecha')}
      </label>

      <div className="space-y-1">
        <label className="block min-w-0 space-y-1">
          <span className="text-sm font-medium">Importe (€)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            aria-invalid={Boolean(errores.importe)}
            aria-describedby={errores.importe ? 'err-importe' : undefined}
            className={clase}
          />
        </label>
        {tipo === 'ajuste' && (
          <div className="grid grid-cols-2 gap-2 pt-1" role="group" aria-label="Sentido del ajuste">
            {(
              [
                ['+', 'Suma'],
                ['-', 'Resta'],
              ] as const
            ).map(([s, t]) => (
              <button
                key={s}
                type="button"
                aria-pressed={signo === s}
                onClick={() => setSigno(s)}
                className={`h-11 rounded-xl border text-sm font-semibold ${signo === s ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {errorCampo('importe')}
      </div>

      <div className="min-w-0 space-y-1">
        <span className="text-sm font-medium">{tipo === 'traspaso' ? 'Casa de origen' : 'Casa'}</span>
          <SelectorOpcion
            tipo="casa"
            opciones={casas}
            valor={casa}
            vacio="Elige una casa"
            etiqueta={tipo === 'traspaso' ? 'Casa de origen' : 'Casa'}
            onCambio={setCasa}
            onCreada={(o) => {
              creada(o)
              setCasa(o.id)
            }}
          />
        {errorCampo('casa_id')}
      </div>

      {tipo === 'traspaso' && (
        <div className="min-w-0 space-y-1">
          <span className="text-sm font-medium">Casa de destino</span>
          <SelectorOpcion
            tipo="casa"
            opciones={casas.filter((c) => c.id !== casa)}
            valor={destino === casa ? '' : destino}
            vacio="Elige la casa de destino"
            etiqueta="Casa de destino"
            onCambio={setDestino}
            onCreada={(o) => {
              creada(o)
              setDestino(o.id)
            }}
          />
          {errorCampo('casa_destino_id')}
        </div>
      )}

      <label className="block min-w-0 space-y-1">
        <span className="text-sm font-medium">Notas (opcional)</span>
        <textarea value={notas} maxLength={500} rows={2} onChange={(e) => setNotas(e.target.value)} className={`${clase} h-auto py-2`} />
        {errorCampo('notas')}
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm">
          {error}
        </p>
      )}

      <button type="submit" disabled={pendiente} className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground disabled:opacity-60">
        {pendiente ? 'Guardando…' : id ? 'Guardar cambios' : 'Guardar'}
      </button>

      {id &&
        (!confirmarBorrado ? (
          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            className="h-12 w-full rounded-xl border border-red-500/40 text-sm font-semibold text-red-600 dark:text-red-400"
          >
            Borrar movimiento
          </button>
        ) : (
          <div role="alertdialog" aria-label="Confirmar borrado" className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
            <p className="text-sm">
              Se borrará este movimiento y los saldos se recalcularán. <strong>No se puede deshacer.</strong>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmarBorrado(false)} className="h-12 rounded-xl border border-border text-sm font-semibold">
                Cancelar
              </button>
              <button type="button" disabled={pendiente} onClick={borrar} className="h-12 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60">
                {pendiente ? 'Borrando…' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        ))}
    </form>
  )
}
