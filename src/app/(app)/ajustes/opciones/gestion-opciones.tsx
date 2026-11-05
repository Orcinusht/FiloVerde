'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archivarOpcion, borrarOpcion, crearOpcion, renombrarOpcion } from '@/lib/server/acciones-opciones'
import { motivoNoBorrable, MAX_NOMBRE_OPCION, type TipoOpcion, type Uso } from '@/lib/apuestas/opciones'

export type FilaOpcion = { id: string; nombre: string; archivada: boolean; uso: Uso }

const TEXTO: Record<TipoOpcion, { nueva: string; vacia: string; placeholder: string }> = {
  casa: { nueva: 'Nueva casa', vacia: 'Aún no tienes casas de apuestas.', placeholder: 'Nombre de la casa' },
  estrategia: { nueva: 'Nueva estrategia', vacia: 'Aún no tienes estrategias.', placeholder: 'Nombre de la estrategia' },
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

// Lista de casas o estrategias con crear, renombrar, archivar/recuperar y borrar (Ajustes).
// Todo lo comprueba el servidor (y la base de datos); aquí solo se piden las acciones.
export function GestionOpciones({ tipo, filas }: { tipo: TipoOpcion; filas: FilaOpcion[] }) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ id: string | null; ok: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  function hacer(id: string | null, accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>, despues?: () => void) {
    setAviso(null)
    iniciar(async () => {
      const r = await accion()
      if (!r.ok) {
        setAviso({ id, ok: false, texto: r.error ?? 'No se ha podido hacer.' })
        return
      }
      setAviso({ id, ok: true, texto: r.mensaje ?? 'Hecho.' })
      despues?.()
      router.refresh()
    })
  }

  const activas = filas.filter((f) => !f.archivada)
  const archivadas = filas.filter((f) => f.archivada)
  const clase = 'h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-brand/40'
  const mensaje = (id: string | null) =>
    aviso && aviso.id === id ? (
      <p role={aviso.ok ? 'status' : 'alert'} className={`text-sm ${aviso.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {aviso.texto}
      </p>
    ) : null

  const fila = (f: FilaOpcion) => {
    const motivo = motivoNoBorrable(tipo, f.uso)
    const usoTxt =
      tipo === 'casa'
        ? `${plural(f.uso.apuestas, 'apuesta', 'apuestas')} · ${plural(f.uso.movimientos, 'movimiento', 'movimientos')}`
        : plural(f.uso.apuestas, 'apuesta', 'apuestas')
    return (
      <li key={f.id} className="space-y-2 p-3" data-opcion={f.nombre}>
        {editando === f.id ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              hacer(f.id, () => renombrarOpcion(tipo, f.id, nombreEdit), () => setEditando(null))
            }}
          >
            <input
              autoFocus
              aria-label={`Nuevo nombre de ${f.nombre}`}
              value={nombreEdit}
              maxLength={MAX_NOMBRE_OPCION}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setNombreEdit(e.target.value)}
              className={clase}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditando(null)} className="h-11 rounded-xl border border-border text-sm font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={pendiente || !nombreEdit.trim()} className="h-11 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50">
                {pendiente ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-semibold">{f.nombre}</p>
              <p className="shrink-0 text-xs text-muted" data-uso>
                {usoTxt}
              </p>
            </div>
            {confirmar === f.id ? (
              <div role="alertdialog" aria-label={`Borrar ${f.nombre}`} className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
                <p className="text-sm">
                  Se borrará «{f.nombre}». No se usa en ninguna apuesta{tipo === 'casa' ? ' ni movimiento' : ''}. <strong>No se puede deshacer.</strong>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirmar(null)} className="h-11 rounded-xl border border-border text-sm font-semibold">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => hacer(null, () => borrarOpcion(tipo, f.id), () => setConfirmar(null))}
                    className="h-11 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {pendiente ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(f.id)
                    setNombreEdit(f.nombre)
                    setAviso(null)
                  }}
                  className="h-11 rounded-xl border border-border text-sm font-semibold"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => hacer(f.id, () => archivarOpcion(tipo, f.id, !f.archivada))}
                  className="h-11 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
                >
                  {f.archivada ? 'Recuperar' : 'Archivar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAviso(null)
                    if (motivo) setAviso({ id: f.id, ok: false, texto: motivo })
                    else setConfirmar(f.id)
                  }}
                  className="h-11 rounded-xl border border-red-500/40 text-sm font-semibold text-red-600 dark:text-red-400"
                >
                  Borrar
                </button>
              </div>
            )}
          </>
        )}
        {mensaje(f.id)}
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          hacer('nueva', () => crearOpcion(tipo, nuevo), () => setNuevo(''))
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">{TEXTO[tipo].nueva}</span>
          <div className="flex gap-2">
            <input
              value={nuevo}
              maxLength={MAX_NOMBRE_OPCION}
              placeholder={TEXTO[tipo].placeholder}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setNuevo(e.target.value)}
              className={clase}
            />
            <button type="submit" disabled={pendiente || !nuevo.trim()} className="h-12 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50">
              Crear
            </button>
          </div>
        </label>
        {mensaje('nueva')}
      </form>

      {mensaje(null)}

      {activas.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">{TEXTO[tipo].vacia}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface" data-lista="activas">
          {activas.map(fila)}
        </ul>
      )}

      {archivadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Archivadas</h2>
          <p className="text-xs text-muted">No salen al crear apuestas o movimientos nuevos, pero siguen contando igual en Análisis, Bankroll y CSV.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface" data-lista="archivadas">
            {archivadas.map(fila)}
          </ul>
        </section>
      )}
    </div>
  )
}
