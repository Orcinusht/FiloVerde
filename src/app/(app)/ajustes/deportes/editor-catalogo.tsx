'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Catalogo } from '@/lib/apuestas/catalogo'
import { anadirDeporte, anadirLiga, borrarDeporte, borrarLiga, renombrarDeporte, renombrarLiga } from './actions'

type Res = { ok: boolean; error?: string; aviso?: string }

export function EditorCatalogo({ catalogo }: { catalogo: Catalogo }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  function ejecutar(accion: () => Promise<Res>, ok?: string) {
    setMensaje(null)
    iniciar(async () => {
      const r = await accion()
      if (!r.ok) setMensaje({ error: true, texto: r.error ?? 'No se ha podido hacer.' })
      else if (r.aviso || ok) setMensaje({ error: false, texto: r.aviso ?? ok ?? '' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 pb-8">
      {mensaje && (
        <p
          role={mensaje.error ? 'alert' : 'status'}
          className={`rounded-xl px-3 py-2 text-sm ${
            mensaje.error ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-green-500/10 text-green-800 dark:text-green-300'
          }`}
        >
          {mensaje.texto}
        </p>
      )}
      <ul className="space-y-2">
        {catalogo.deportes.map((d) => {
          const ligas = catalogo.ligas.filter((l) => l.deporte_id === d.id)
          const abiertoAqui = abierto === d.id
          return (
            <li key={d.id} className="rounded-xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setAbierto(abiertoAqui ? null : d.id)}
                aria-expanded={abiertoAqui}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
              >
                <span className="font-semibold">{d.nombre}</span>
                <span className="text-sm text-muted">
                  {ligas.length} {ligas.length === 1 ? 'liga' : 'ligas'} {abiertoAqui ? '▴' : '▾'}
                </span>
              </button>
              {abiertoAqui && (
                <div className="space-y-3 border-t border-border p-3">
                  <FilaEditable
                    etiqueta={`Nombre del deporte ${d.nombre}`}
                    nombre={d.nombre}
                    pendiente={pendiente}
                    onRenombrar={(n) => ejecutar(() => renombrarDeporte(d.id, n), 'Deporte renombrado.')}
                    onBorrar={() => ejecutar(() => borrarDeporte(d.id), `«${d.nombre}» borrado del catálogo (y sus ligas).`)}
                    textoBorrar={`¿Borrar «${d.nombre}» y sus ${ligas.length} ligas del catálogo? Tus apuestas no cambian.`}
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ligas</p>
                  <ul className="space-y-2">
                    {ligas.map((l) => (
                      <li key={l.id}>
                        <FilaEditable
                          etiqueta={`Nombre de la liga ${l.nombre}`}
                          nombre={l.nombre}
                          pendiente={pendiente}
                          onRenombrar={(n) => ejecutar(() => renombrarLiga(l.id, n), 'Liga renombrada.')}
                          onBorrar={() => ejecutar(() => borrarLiga(l.id), `«${l.nombre}» borrada del catálogo.`)}
                          textoBorrar={`¿Borrar la liga «${l.nombre}» del catálogo? Tus apuestas no cambian.`}
                        />
                      </li>
                    ))}
                  </ul>
                  <Anadir
                    etiqueta={`Nueva liga de ${d.nombre}`}
                    pendiente={pendiente}
                    onAnadir={(n) => ejecutar(() => anadirLiga(d.nombre, n), 'Liga añadida.')}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Anadir etiqueta="Nuevo deporte" pendiente={pendiente} onAnadir={(n) => ejecutar(() => anadirDeporte(n), 'Deporte añadido.')} />
    </div>
  )
}

function FilaEditable({
  etiqueta,
  nombre,
  pendiente,
  onRenombrar,
  onBorrar,
  textoBorrar,
}: {
  etiqueta: string
  nombre: string
  pendiente: boolean
  onRenombrar: (n: string) => void
  onBorrar: () => void
  textoBorrar: string
}) {
  const [valor, setValor] = useState(nombre)
  const [confirmar, setConfirmar] = useState(false)
  if (confirmar) {
    return (
      <div role="alertdialog" className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
        <p className="text-sm">{textoBorrar}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirmar(false)} className="h-11 rounded-lg border border-border text-sm font-semibold">
            Cancelar
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setConfirmar(false)
              onBorrar()
            }}
            className="h-11 rounded-lg bg-red-600 text-sm font-semibold text-white"
          >
            Sí, borrar
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 gap-2">
      <input
        aria-label={etiqueta}
        value={valor}
        maxLength={80}
        onChange={(e) => setValor(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base"
      />
      {valor.trim() !== nombre && (
        <button
          type="button"
          disabled={pendiente || !valor.trim()}
          onClick={() => onRenombrar(valor)}
          className="h-11 shrink-0 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          Guardar
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Borrar ${nombre}`}
        className="h-11 shrink-0 rounded-lg border border-border px-3 text-sm text-red-600 dark:text-red-400"
      >
        Borrar
      </button>
    </div>
  )
}

function Anadir({ etiqueta, pendiente, onAnadir }: { etiqueta: string; pendiente: boolean; onAnadir: (n: string) => void }) {
  const [valor, setValor] = useState('')
  return (
    <div className="flex min-w-0 gap-2">
      <input
        aria-label={etiqueta}
        placeholder={etiqueta}
        value={valor}
        maxLength={80}
        onChange={(e) => setValor(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-lg border border-dashed border-border bg-background px-3 text-base"
      />
      <button
        type="button"
        disabled={pendiente || !valor.trim()}
        onClick={() => {
          onAnadir(valor)
          setValor('')
        }}
        className="h-11 shrink-0 rounded-lg border border-brand px-3 text-sm font-semibold text-brand disabled:opacity-50"
      >
        Añadir
      </button>
    </div>
  )
}
