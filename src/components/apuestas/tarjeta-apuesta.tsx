import Link from 'next/link'
import type { FilaApuesta } from '@/lib/server/datos'
import { COLOR_ESTADO, NOMBRE_ESTADO, NOMBRE_TIPO } from '@/lib/apuestas/estados'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { cuotaATexto } from '@/lib/apuestas/cuotas'
import { formatoFecha } from '@/lib/apuestas/fechas'
import { DeporteConEmoji } from './deporte-con-emoji'

// Tarjeta de una apuesta (lista de Apuestas y detalle de Análisis). Al pulsarla se abre la
// apuesta; `volver` es la dirección a la que se regresa después.
export function TarjetaApuesta({ a, volver }: { a: FilaApuesta; volver: string }) {
  return (
    <Link
      href={`/apuestas/${a.id}?volver=${encodeURIComponent(volver)}`}
      className="flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-surface p-3 active:bg-background"
    >
      {/* Bloque principal: todo menos el resultado. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {a.en_directo && (
            <span className="mr-1.5 inline-block rounded bg-red-600 px-1.5 py-px align-[1px] text-[10px] font-bold tracking-wide text-white">
              LIVE
            </span>
          )}
          {a.precipitada && (
            <span
              title="Precipitada"
              aria-label="Precipitada"
              className="mr-1.5 inline-block rounded bg-amber-500/20 px-1.5 py-px align-[1px] text-[10px] font-bold text-amber-800 dark:text-amber-300"
            >
              ⚡ PRECIP.
            </span>
          )}
          {a.promo_tipo && (
            <span className="mr-1.5 inline-block rounded bg-violet-500/15 px-1.5 py-px align-[1px] text-[10px] font-bold tracking-wide text-violet-700 dark:text-violet-300">
              PROMO
            </span>
          )}
          {a.promo_tipo === 'credito' && (
            <span className="mr-1.5 inline-block rounded bg-sky-500/15 px-1.5 py-px align-[1px] text-[10px] font-bold tracking-wide text-sky-700 dark:text-sky-300">
              CRÉDITO
            </span>
          )}
          {a.casa ?? 'Sin casa'} · {NOMBRE_TIPO[a.tipo]}
          {a.n_selecciones > 1 ? ` (${a.n_selecciones})` : ''}
        </p>
        {a.deporte && (
          <p className="truncate text-xs font-medium text-muted">
            <DeporteConEmoji nombre={a.deporte} />
          </p>
        )}
        <p className="truncate text-sm text-muted">{a.primer_evento ?? '—'}</p>
        <p className="text-xs text-muted">{formatoFecha(a.fecha, { conHora: false })}</p>
        {/* Si no cabe, pasa a dos líneas: los números nunca se cortan. */}
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="shrink-0 font-semibold">{formatoImporte(a.importe, a.divisa)}</span>
          <span className="shrink-0 text-muted">@ {cuotaATexto(a.cuota_total) || '—'}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[a.estado]}`}>
            {NOMBRE_ESTADO[a.estado]}
          </span>
        </div>
      </div>
      {/* Ranura de la derecha: SOLO el resultado (vacía en pendientes). */}
      {a.resultado_economico != null && a.estado !== 'pendiente' && (
        <p
          className={`shrink-0 whitespace-nowrap pt-0.5 text-right text-lg font-bold leading-tight ${
            a.resultado_economico > 0
              ? 'text-green-700 dark:text-green-400'
              : a.resultado_economico < 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-muted'
          }`}
        >
          {formatoImporte(a.resultado_economico, a.divisa, { conSigno: true })}
        </p>
      )}
    </Link>
  )
}
