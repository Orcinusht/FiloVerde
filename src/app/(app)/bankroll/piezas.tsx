import Link from 'next/link'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { formatoFecha } from '@/lib/apuestas/fechas'
import { porcentaje } from '@/lib/analisis/calculos'
import { NOMBRE_MOVIMIENTO, efectoEnCasa, efectoGlobal, type Cifras, type Movimiento } from '@/lib/bankroll/calculos'
import type { Casa } from '@/lib/bankroll/leer'

// Piezas de la pantalla Bankroll (servidor).

export const eur = (c: number | null, conSigno = false) => formatoImporte(c, 'EUR', { conSigno })
const tono = (v: number | null | undefined) =>
  v == null || v === 0 ? '' : v > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'

function Dato({ n, v, color, grande = false }: { n: string; v: string; color?: number | null; grande?: boolean }) {
  return (
    <div className="min-w-0" data-cifra={n}>
      <dt className="text-xs text-muted">{n}</dt>
      <dd className={`truncate font-semibold tabular-nums ${grande ? 'text-lg' : 'text-sm'} ${tono(color)}`}>{v}</dd>
    </div>
  )
}

// Las 7 cifras (global o de una casa). En "Sin casa" no hay saldo ni disponible.
export function BloqueCifras({ c, titulo }: { c: Cifras; titulo?: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-3" data-bloque={titulo ?? 'global'}>
      {titulo && <p className="text-sm font-semibold">{titulo}</p>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {c.saldo != null && <Dato n="Saldo" v={eur(c.saldo)} grande />}
        <Dato n="En juego" v={eur(c.enJuego)} grande={c.saldo == null} />
        {c.disponible != null && <Dato n="Disponible estimado" v={eur(c.disponible)} />}
        <Dato n="Beneficio de apuestas" v={eur(c.beneficio, true)} color={c.beneficio} />
        {c.saldo != null && <Dato n="Total depositado" v={eur(c.depositado)} />}
        {c.saldo != null && <Dato n="Total retirado" v={eur(c.retirado)} />}
        {c.saldo != null && <Dato n="ROI sobre bankroll" v={porcentaje(c.roi)} color={c.roi} />}
      </dl>
      {c.soloTraspasos && <p className="text-xs text-muted">ROI «—»: esta casa solo recibe dinero por traspasos (no cuentan como depósito).</p>}
    </div>
  )
}

// Tarjeta de una casa en la pantalla principal: abre su detalle.
export function TarjetaCasa({ href, nombre, c, archivada = false }: { href: string; nombre: string; c: Cifras; archivada?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3 active:bg-background" data-casa={nombre}>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-words text-sm font-semibold">
            {nombre}
            {archivada && <span className="ml-1.5 inline-block rounded bg-border/60 px-1.5 py-px align-[1px] text-[10px] font-bold uppercase tracking-wide text-muted">Archivada</span>}
          </p>
          <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
            {c.saldo != null && <Dato n="Saldo" v={eur(c.saldo)} />}
            <Dato n="En juego" v={eur(c.enJuego)} />
            {c.disponible != null && <Dato n="Disponible" v={eur(c.disponible)} />}
            <Dato n="Beneficio" v={eur(c.beneficio, true)} color={c.beneficio} />
            {c.saldo != null && <Dato n="Depositado" v={eur(c.depositado)} />}
            {c.saldo != null && <Dato n="ROI" v={porcentaje(c.roi)} color={c.roi} />}
          </dl>
          {c.soloTraspasos && <p className="text-[11px] text-muted">ROI «—»: solo recibe traspasos.</p>}
        </div>
        <span aria-hidden="true" className="shrink-0 text-lg text-muted">
          ›
        </span>
      </Link>
    </li>
  )
}

const COLOR_TIPO: Record<string, string> = {
  deposito: 'bg-green-500/15 text-green-800 dark:text-green-300',
  retirada: 'bg-red-500/15 text-red-700 dark:text-red-300',
  ajuste: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  traspaso: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
}

// Lista de movimientos (más recientes primero). `casaId`: el importe se muestra con su efecto en esa
// casa (un traspaso resta en el origen y suma en el destino); sin casa, con su efecto en el global.
export function ListaMovimientos({
  movimientos,
  casas,
  casaId,
  enlace,
}: {
  movimientos: Movimiento[]
  casas: Map<string, Casa>
  casaId?: string
  enlace: (id: string) => string
}) {
  const nombre = (id: string | null) => (id ? (casas.get(id)?.nombre ?? '¿?') : '')
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" data-lista="movimientos">
      {movimientos.map((m) => {
        const efecto = casaId ? efectoEnCasa(m, casaId) : efectoGlobal(m)
        const importe = m.tipo === 'traspaso' && !casaId ? eur(m.importe) : eur(efecto, true)
        return (
          <li key={m.id}>
            <Link href={enlace(m.id)} className="flex items-start gap-3 p-3 active:bg-background">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <span className={`mr-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[10px] font-bold uppercase tracking-wide ${COLOR_TIPO[m.tipo]}`}>
                    {NOMBRE_MOVIMIENTO[m.tipo]}
                  </span>
                  {m.tipo === 'traspaso' ? `${nombre(m.casa_id)} → ${nombre(m.casa_destino_id)}` : nombre(m.casa_id)}
                </p>
                <p className="text-xs text-muted">{formatoFecha(m.fecha, { conHora: false })}</p>
                {m.notas && <p className="truncate text-xs text-muted">{m.notas}</p>}
              </div>
              <p className={`shrink-0 whitespace-nowrap pt-0.5 text-right text-base font-bold tabular-nums ${m.tipo === 'traspaso' && !casaId ? 'text-muted' : tono(efecto)}`}>
                {importe}
              </p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function Paginacion({ total, pagina, porPagina, enlace }: { total: number; pagina: number; porPagina: number; enlace: (p: number) => string }) {
  if (total <= porPagina) return null
  return (
    <nav className="flex items-center justify-between text-sm">
      {pagina > 0 ? (
        <Link href={enlace(pagina - 1)} className="flex h-11 items-center px-2 font-semibold text-brand">
          ← Más recientes
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        {pagina * porPagina + 1}–{Math.min(total, (pagina + 1) * porPagina)} de {total}
      </span>
      {(pagina + 1) * porPagina < total ? (
        <Link href={enlace(pagina + 1)} className="flex h-11 items-center px-2 font-semibold text-brand">
          Más antiguos →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

export function AvisoError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mx-4 mt-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
      {children}
    </p>
  )
}
