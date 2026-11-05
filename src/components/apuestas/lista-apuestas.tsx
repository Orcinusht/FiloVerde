import Link from 'next/link'
import { connection } from 'next/server'
import { listarApuestas, listarCasas, listarPendientes, obtenerCatalogo, POR_PAGINA } from '@/lib/server/datos'
import { DEPORTE_MIXTO } from '@/lib/apuestas/catalogo'
import { esEstadoApuesta } from '@/lib/apuestas/estados'
import { FiltrosApuestas } from './filtros-apuestas'
import { ReintentoSilencioso } from './reintento-silencioso'
import { VueltaALista } from './vuelta-a-lista'
import { TarjetaApuesta } from './tarjeta-apuesta'

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
  const promo = uno(sp.promo) === '1'
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(uno(sp.pagina) || '0', 10) || 0))

  let datos: Awaited<ReturnType<typeof listarApuestas>>
  let casas: Awaited<ReturnType<typeof listarCasas>>
  let nPendientes = 0
  let deportes: string[] = []
  try {
    let pendientes: Awaited<ReturnType<typeof listarPendientes>>
    let catalogo: Awaited<ReturnType<typeof obtenerCatalogo>>
    ;[datos, casas, catalogo, pendientes] = await Promise.all([
      listarApuestas({ estado, casa, deporte, directo, precipitada, promo, pagina }),
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
  const hayFiltro = Boolean(estado || casa || deporte || directo || precipitada || promo)
  const enlace = (p: number) => {
    const q = new URLSearchParams()
    if (estado) q.set('estado', estado)
    if (casa) q.set('casa', casa)
    if (deporte) q.set('deporte', deporte)
    if (directo) q.set('directo', '1')
    if (precipitada) q.set('precipitada', '1')
    if (promo) q.set('promo', '1')
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
      <FiltrosApuestas estado={estado} casa={casa} deporte={deporte} casas={casas} deportes={[...deportes, DEPORTE_MIXTO]} directo={directo} precipitada={precipitada} promo={promo} />

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
              <TarjetaApuesta a={a} volver={enlace(pagina)} />
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
