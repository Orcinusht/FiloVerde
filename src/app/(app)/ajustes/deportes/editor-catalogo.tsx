'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Catalogo } from '@/lib/apuestas/catalogo'
import { MAX_NOMBRE, motivoNoBorrable, textoAviso, type TipoCatalogo, type Uso } from '@/lib/apuestas/catalogo-gestion'
import { anadirDeporte, anadirLiga, archivarCatalogo, borrarCatalogo, previsualizarRenombrado, renombrarEnTodo } from './actions'

type Res = { ok: boolean; error?: string; aviso?: string }
const SIN_USO: Uso = { selecciones: 0, apuestas: 0 }
const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

// Ajustes → Deportes y ligas: crear, renombrar (en el catálogo y en tus apuestas, con aviso previo),
// archivar/recuperar y borrar solo sin uso. Todo lo comprueba el servidor y la base de datos.
export function EditorCatalogo({ catalogo, uso, nRevisar }: { catalogo: Catalogo; uso: Record<string, Uso>; nRevisar: number }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  function anadir(accion: () => Promise<Res>, ok: string) {
    setMensaje(null)
    iniciar(async () => {
      const r = await accion()
      if (!r.ok) setMensaje({ error: true, texto: r.error ?? 'No se ha podido hacer.' })
      else setMensaje({ error: false, texto: r.aviso ?? ok })
      router.refresh()
    })
  }

  // Mensajes que deben verse aunque la fila desaparezca (p. ej. tras borrarla).
  const avisar = (texto: string) => setMensaje({ error: false, texto })
  const activos = catalogo.deportes.filter((d) => !d.archivada)
  const archivados = catalogo.deportes.filter((d) => d.archivada)

  const bloqueDeporte = (d: (typeof catalogo.deportes)[number]) => {
    const ligas = catalogo.ligas.filter((l) => l.deporte_id === d.id)
    const ligasActivas = ligas.filter((l) => !l.archivada)
    const ligasArchivadas = ligas.filter((l) => l.archivada)
    const u = uso[d.id] ?? SIN_USO
    const abiertoAqui = abierto === d.id
    return (
      <li key={d.id} className="rounded-xl border border-border bg-surface" data-deporte={d.nombre}>
        <button
          type="button"
          onClick={() => setAbierto(abiertoAqui ? null : d.id)}
          aria-expanded={abiertoAqui}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
        >
          <span className="min-w-0 break-words font-semibold">{d.nombre}</span>
          <span className="shrink-0 text-xs text-muted">
            {plural(u.selecciones, 'selección', 'selecciones')} · {plural(ligas.length, 'liga', 'ligas')} {abiertoAqui ? '▴' : '▾'}
          </span>
        </button>
        {abiertoAqui && (
          <div className="space-y-3 border-t border-border p-3">
            <FilaCatalogo tipo="deporte" id={d.id} nombre={d.nombre} archivada={!!d.archivada} uso={u} avisar={avisar} />
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Ligas</p>
            {ligasActivas.length === 0 && <p className="text-sm text-muted">Sin ligas.</p>}
            <ul className="space-y-3">
              {ligasActivas.map((l) => (
                <li key={l.id}>
                  <FilaCatalogo tipo="liga" id={l.id} nombre={l.nombre} archivada={false} uso={uso[l.id] ?? SIN_USO} avisar={avisar} />
                </li>
              ))}
            </ul>
            {ligasArchivadas.length > 0 && (
              <>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Ligas archivadas</p>
                <ul className="space-y-3">
                  {ligasArchivadas.map((l) => (
                    <li key={l.id}>
                      <FilaCatalogo tipo="liga" id={l.id} nombre={l.nombre} archivada uso={uso[l.id] ?? SIN_USO} avisar={avisar} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!d.archivada && (
              <Anadir etiqueta={`Nueva liga de ${d.nombre}`} max={MAX_NOMBRE.liga} pendiente={pendiente} onAnadir={(n) => anadir(() => anadirLiga(d.nombre, n), 'Liga añadida.')} />
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <Link
        href="/ajustes/deportes/revisar"
        className="flex min-h-12 items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm font-medium"
      >
        <span>
          Revisar posibles errores <span className="font-bold" data-contador-revisar>({nRevisar})</span>
        </span>
        <span aria-hidden="true">→</span>
      </Link>

      {mensaje && (
        <p
          role={mensaje.error ? 'alert' : 'status'}
          className={`rounded-xl px-3 py-2 text-sm ${mensaje.error ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-green-500/10 text-green-800 dark:text-green-300'}`}
        >
          {mensaje.texto}
        </p>
      )}

      <ul className="space-y-2">{activos.map(bloqueDeporte)}</ul>
      <Anadir etiqueta="Nuevo deporte" max={MAX_NOMBRE.deporte} pendiente={pendiente} onAnadir={(n) => anadir(() => anadirDeporte(n), 'Deporte añadido.')} />

      {archivados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Deportes archivados</h2>
          <ul className="space-y-2">{archivados.map(bloqueDeporte)}</ul>
        </section>
      )}
      <p className="text-xs text-muted">
        Archivados: no salen al registrar apuestas nuevas, pero siguen contando igual en Análisis y Bankroll.
      </p>
    </div>
  )
}

// Una fila del catálogo (deporte o liga) con Renombrar (con aviso previo), Archivar/Recuperar y Borrar.
function FilaCatalogo({
  tipo,
  id,
  nombre,
  archivada,
  uso,
  avisar,
}: {
  tipo: TipoCatalogo
  id: string
  nombre: string
  archivada: boolean
  uso: Uso
  avisar: (texto: string) => void
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'ver' | 'editar' | 'aviso' | 'borrar'>('ver')
  const [valor, setValor] = useState(nombre)
  const [aviso, setAviso] = useState<Uso | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, iniciar] = useTransition()
  const que = tipo === 'deporte' ? 'deporte' : 'liga'

  function revisar() {
    setMsg(null)
    iniciar(async () => {
      const r = await previsualizarRenombrado(tipo, id)
      if (!r.ok) return setMsg({ ok: false, texto: r.error })
      setAviso(r.item)
      setModo('aviso')
    })
  }
  function confirmar() {
    if (!aviso) return
    setMsg(null)
    iniciar(async () => {
      const r = await renombrarEnTodo(tipo, id, valor, aviso.selecciones, aviso.apuestas)
      if (!r.ok) {
        // Si algo cambió desde el aviso, se vuelve a calcular y se pide confirmar otra vez.
        if (r.codigo === 'cambiado') {
          const p = await previsualizarRenombrado(tipo, id)
          if (p.ok) setAviso(p.item)
        }
        return setMsg({ ok: false, texto: r.error })
      }
      setMsg({ ok: true, texto: `Renombrado a «${valor.trim().replace(/\s+/g, ' ')}»${r.item.selecciones ? ` en el catálogo y en ${plural(r.item.selecciones, 'selección', 'selecciones')}` : ''}.` })
      setModo('ver')
      router.refresh()
    })
  }
  function hacer(accion: () => Promise<Res>, arriba = false) {
    setMsg(null)
    iniciar(async () => {
      const r = await accion()
      if (r.ok && arriba) avisar(r.aviso ?? 'Hecho.')
      else setMsg({ ok: r.ok, texto: r.ok ? (r.aviso ?? 'Hecho.') : (r.error ?? 'No se ha podido hacer.') })
      if (r.ok) setModo('ver')
      router.refresh()
    })
  }

  const motivo = motivoNoBorrable(tipo, uso)
  const clase = 'h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-brand/40'

  return (
    <div className="space-y-2" data-fila-catalogo={nombre}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-semibold">
          {nombre}
          {archivada && <span className="ml-1.5 rounded bg-border/60 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-muted">Archivada</span>}
        </p>
        <p className="shrink-0 text-xs text-muted" data-uso>
          {plural(uso.selecciones, 'selección', 'selecciones')} · {plural(uso.apuestas, 'apuesta', 'apuestas')}
        </p>
      </div>

      {modo === 'editar' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            revisar()
          }}
        >
          <input
            autoFocus
            aria-label={`Nuevo nombre de ${nombre}`}
            value={valor}
            maxLength={MAX_NOMBRE[tipo]}
            autoComplete="off"
            enterKeyHint="next"
            onChange={(e) => setValor(e.target.value)}
            className={clase}
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('ver')} className="h-11 rounded-xl border border-border text-sm font-semibold">
              Cancelar
            </button>
            <button type="submit" disabled={pendiente || !valor.trim() || valor.trim() === nombre} className="h-11 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50">
              {pendiente ? '…' : 'Revisar cambio'}
            </button>
          </div>
        </form>
      )}

      {modo === 'aviso' && aviso && (
        <div role="alertdialog" aria-label={`Renombrar ${nombre}`} className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-sm">
            Renombrar «{nombre}» a «{valor.trim().replace(/\s+/g, ' ')}».
          </p>
          <p className="text-sm font-semibold" data-aviso-renombrar>
            {textoAviso(aviso)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('editar')} className="h-11 rounded-xl border border-border text-sm font-semibold">
              Cancelar
            </button>
            <button type="button" disabled={pendiente} onClick={confirmar} className="h-11 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50">
              {pendiente ? 'Renombrando…' : 'Sí, renombrar'}
            </button>
          </div>
        </div>
      )}

      {modo === 'borrar' && (
        <div role="alertdialog" aria-label={`Borrar ${nombre}`} className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
          <p className="text-sm">
            Se borrará «{nombre}» del catálogo{tipo === 'deporte' ? ' (y sus ligas)' : ''}. No se usa en ninguna apuesta. <strong>No se puede deshacer.</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('ver')} className="h-11 rounded-xl border border-border text-sm font-semibold">
              Cancelar
            </button>
            <button type="button" disabled={pendiente} onClick={() => hacer(() => borrarCatalogo(tipo, id), true)} className="h-11 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60">
              {pendiente ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </div>
      )}

      {modo === 'ver' && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setValor(nombre)
              setMsg(null)
              setModo('editar')
            }}
            className="h-11 rounded-xl border border-border text-sm font-semibold"
          >
            Renombrar
          </button>
          <button type="button" disabled={pendiente} onClick={() => hacer(() => archivarCatalogo(tipo, id, !archivada), true)} className="h-11 rounded-xl border border-border text-sm font-semibold disabled:opacity-60">
            {archivada ? 'Recuperar' : 'Archivar'}
          </button>
          <button
            type="button"
            aria-label={`Borrar ${que} ${nombre}`}
            onClick={() => {
              setMsg(null)
              if (motivo) setMsg({ ok: false, texto: motivo })
              else setModo('borrar')
            }}
            className="h-11 rounded-xl border border-red-500/40 text-sm font-semibold text-red-600 dark:text-red-400"
          >
            Borrar
          </button>
        </div>
      )}

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {msg.texto}
        </p>
      )}
    </div>
  )
}

function Anadir({ etiqueta, max, pendiente, onAnadir }: { etiqueta: string; max: number; pendiente: boolean; onAnadir: (n: string) => void }) {
  const [valor, setValor] = useState('')
  return (
    <div className="flex min-w-0 gap-2">
      <input
        aria-label={etiqueta}
        placeholder={etiqueta}
        value={valor}
        maxLength={max}
        autoComplete="off"
        onChange={(e) => setValor(e.target.value)}
        className="h-12 min-w-0 flex-1 rounded-xl border border-dashed border-border bg-background px-3 text-base"
      />
      <button
        type="button"
        disabled={pendiente || !valor.trim()}
        onClick={() => {
          onAnadir(valor)
          setValor('')
        }}
        className="h-12 shrink-0 rounded-xl border border-brand px-3 text-sm font-semibold text-brand disabled:opacity-50"
      >
        Añadir
      </button>
    </div>
  )
}
