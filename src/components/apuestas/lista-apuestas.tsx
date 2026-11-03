import Link from 'next/link'
import { connection } from 'next/server'
import { listarApuestas, listarCasas, listarPendientes, obtenerCatalogo, POR_PAGINA } from '@/lib/server/datos'
import { DEPORTE_MIXTO } from '@/lib/apuestas/catalogo'
import { COLOR_ESTADO, NOMBRE_ESTADO, NOMBRE_TIPO, esEstadoApuesta } from '@/lib/apuestas/estados'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { cuotaATexto } from '@/lib/apuestas/cuotas'
import { formatoFecha } from '@/lib/apuestas/fechas'
import { FiltrosApuestas } from './filtros-apuestas'
import { ReintentoSilencioso } from './reintento-silencioso'
import { VueltaALista } from './vuelta-a-lista'
import { DeporteConEmoji } from './deporte-con-emoji'

type Busqueda = Promise<Record<string, string | string[] | undefined>>

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export async function ListaApuestas({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan (y fuera del try)
  const estado = esEstadoApuesta(uno(sp.estado)) ? uno(sp.estado) : ''
  const casa = /^([0-9a-f-]{36}|sin)$/i.test(uno(sp.casa)) ? uno(sp.casa) : ''
  // El deporte es texto: se acepta cualquier nombre razonable (solo sirve para filtrar).
  const deporte = uno(sp.deporte).trim().slice(0, 60)
  const directo = uno(sp.directo) === '1'
  const precipitada = uno(sp.precipitada) === '1'
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(uno(sp.pagina) || '0', 10) || 0))

  let datos: Awaited<ReturnType<typeof listarApuestas>>
  let casas: Awaited<ReturnType<typeof listarCasas>>
  let nPendientes = 0
  let deportes: string[] = []
  try {
    let pendientes: Awaited<ReturnType<typeof listarPendientes>>
    let catalogo: Awaited<ReturnType<typeof obtenerCatalogo>>
    ;[datos, casas, catalogo, pendientes] = await Promise.all([
      listarApuestas({ estado, casa, deporte, directo, precipitada, pagina }),
      listarCasas(),
      obtenerCatalogo(),
      listarPendientes().catch(() => []),
    ])
    nPendientes = pendientes.length
    deportes = catalogo.deportes.map((d) => d.nombre)
  } catch (e) {
    console.error('[apuestas:listar]', { message: String((e as Error)?.message ?? e).slice(0, 200) })
    return (
      <p role="alert" className="mx-4 mt-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
        No se han podido cargar tus apuestas. Recarga la página en unos segundos.
      </p>
    )
  }

  const { filas, total } = datos
  const hayFiltro = Boolean(estado || casa || deporte || directo || precipitada)
  const enlace = (p: number) => {
    const q = new URLSearchParams()
    if (estado) q.set('estado', estado)
    if (casa) q.set('casa', casa)
    if (deporte) q.set('deporte', deporte)
    if (directo) q.set('directo', '1')
    if (precipitada) q.set('precipitada', '1')
    if (p > 0) q.set('pagina', String(p))
    const s = q.toString()
    return s ? `/apuestas?${s}` : '/apuestas'
  }

  return (
    <div className="space-y-3 px-4 pt-1">
      <ReintentoSilencioso />
      <VueltaALista />
      {nPendientes > 0 && (
        <Link
          href="/apuestas/nueva?pendientes=1"
          className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm"
        >
          <span>
            Tienes <strong>{nPendientes}</strong> {nPendientes === 1 ? 'apuesta leída' : 'apuestas leídas'} sin revisar.
          </span>
          <span className="shrink-0 font-semibold text-brand">Revisar →</span>
        </Link>
      )}
      <FiltrosApuestas estado={estado} casa={casa} deporte={deporte} casas={casas} deportes={[...deportes, DEPORTE_MIXTO]} directo={directo} precipitada={precipitada} />

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          {hayFiltro ? (
            <p className="text-sm text-muted">No hay apuestas con estos filtros.</p>
          ) : (
            <>
              <p className="text-lg font-semibold">Aún no hay apuestas</p>
              <p className="mt-1 text-sm text-muted">Pulsa «+ Nueva» y sube la captura de una apuesta.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filas.map((a) => (
            <li key={a.id}>
              <Link
                href={`/apuestas/${a.id}?volver=${encodeURIComponent(enlace(pagina))}`}
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
                    {a.casa ?? 'Sin casa'} · {NOMBRE_TIPO[a.tipo]}
                    {a.n_selecciones > 1 ? ` (${a.n_selecciones})` : ''}
                  </p>
                  {a.deporte && (
                    <p className="truncate text-xs font-medium text-muted">
                      <DeporteConEmoji nombre={a.deporte} />
                    </p>
                  )}
                  <p className="truncate text-sm text-muted">{a.primer_evento ?? '—'}</p>
                  <p className="text-xs text-muted">{formatoFecha(a.fecha)}</p>
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
            </li>
          ))}
        </ul>
      )}

      {total > POR_PAGINA && (
        <nav className="flex items-center justify-between pb-4 text-sm">
          {pagina > 0 ? (
            <Link href={enlace(pagina - 1)} className="flex h-11 items-center px-2 font-semibold text-brand">
              ← Más recientes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}
          </span>
          {(pagina + 1) * POR_PAGINA < total ? (
            <Link href={enlace(pagina + 1)} className="flex h-11 items-center px-2 font-semibold text-brand">
              Anteriores →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
