import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { TarjetaApuesta } from '@/components/apuestas/tarjeta-apuesta'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import type { FilaApuesta } from '@/lib/server/datos'
import { leerApuestasAnalisis } from '@/lib/analisis/leer'
import { PERIODOS, detalle, esPeriodo, rangoPeriodo, type ApuestaAnalisis, type Color } from '@/lib/analisis/calculos'
import { enlaceDetalleAcierto, enlaceDetalleSegmento, leerPeticionDetalle, vueltaDetalle } from '@/lib/analisis/direccion'
import { leerCasa } from '@/lib/graficas/series'
import { FiltroFechas } from '../controles'
import { NOMBRE_TIPO, esTipoApuesta, type EstadoApuesta, type TipoApuesta } from '@/lib/apuestas/estados'

export const metadata = { title: 'Detalle · Análisis · Filoverde' }

// Detalle de una fila de Análisis: las apuestas que forman esa cifra. Todo va en la dirección
// (periodo, segmento, filtros y la fila), así que Atrás, recargar o volver de una apuesta deja
// al usuario en el mismo sitio.

type Busqueda = Promise<Record<string, string | string[] | undefined>>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const POR_PAGINA = 50

export default function Page({ searchParams }: PageProps<'/analisis/detalle'>) {
  return (
    <>
      <PageHeader
        title="Detalle"
        accion={
          <Suspense fallback={<Volver href="/analisis" texto="← Análisis" />}>
            <VolverAAnalisis searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<Cargando />}>
        <DetalleAnalisis searchParams={searchParams} />
      </Suspense>
    </>
  )
}

// "← Análisis", o "← Gráficas" si el detalle se abrió desde allí.
async function VolverAAnalisis({ searchParams }: { searchParams: Busqueda }) {
  const v = vueltaDetalle(await searchParams)
  return <Volver href={v.href} texto={v.texto} />
}

function Volver({ href, texto }: { href: string; texto: string }) {
  return (
    <Link href={href} className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
      {texto}
    </Link>
  )
}

function Cargando() {
  return (
    <div className="space-y-2 px-4 pt-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  )
}

function Aviso({ children, volver }: { children: React.ReactNode; volver: string }) {
  return (
    <div role="alert" className="mx-4 mt-4 space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
      <p>{children}</p>
      <Link href={volver} className="inline-flex h-11 items-center font-semibold text-brand">
        Volver
      </Link>
    </div>
  )
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

async function DetalleAnalisis({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan
  const volver = vueltaDetalle(sp).href
  const casa = leerCasa(uno(sp.casa)) // solo desde Gráficas: '' = todas
  const peticion = leerPeticionDetalle(sp)
  if (!peticion) return <Aviso volver={volver}>Esta dirección no corresponde a ninguna fila del análisis.</Aviso>
  const periodo = esPeriodo(uno(sp.periodo)) ? uno(sp.periodo) : 'todo'
  const rango = rangoPeriodo(periodo as keyof typeof PERIODOS, uno(sp.desde), uno(sp.hasta))
  if (peticion.vista === 'aciertos') peticion.tipo = esTipoApuesta(peticion.tipo) ? peticion.tipo : undefined
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(uno(sp.pagina) || '0', 10) || 0))

  let apuestas: ApuestaAnalisis[] = []
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else apuestas = await leerApuestasAnalisis(supabase, userId, rango, casa)
  } catch (e) {
    registrarError('analisis:detalle', e)
    fallo = 'error'
  }
  if (fallo === 'sesion') return <Aviso volver={volver}>Tu sesión ha caducado. Vuelve a entrar para ver el detalle.</Aviso>
  if (fallo === 'error') return <Aviso volver={volver}>No se ha podido cargar el detalle. Recarga la página en unos segundos.</Aviso>

  // Mismo cálculo que la tabla de Análisis: la lista y la cifra no pueden diferir.
  const d = detalle(apuestas, peticion)
  if (!d)
    return (
      <>
        <div className="px-4 pt-2">
          <FiltroFechas periodo={rango.periodo} desde={rango.desdeDia} hasta={rango.hastaDia} periodos={PERIODOS} />
        </div>
        <Aviso volver={volver}>No hay apuestas en esta fila con el periodo y los filtros elegidos.</Aviso>
      </>
    )

  const porId = new Map(apuestas.map((a) => [a.id, a]))
  const total = d.ids.length
  const visibles = d.ids.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map((id) => porId.get(id)!)
  const enlace = (p: number, color?: Color) => {
    const base =
      peticion.vista === 'seg'
        ? enlaceDetalleSegmento(sp, peticion.seg, peticion.clave)
        : enlaceDetalleAcierto(sp, peticion.por, peticion.clave, color ?? peticion.color)
    return p > 0 ? `${base}&pagina=${p}` : base
  }
  const actual = enlace(pagina)
  const periodoTxt =
    rango.periodo === 'todo' ? 'Todo el historial' : `${rango.desdeDia || '…'} a ${rango.hastaDia || '…'}`
  const recuento =
    peticion.vista === 'seg'
      ? plural(total, 'apuesta', 'apuestas')
      : `${plural(d.selecciones ?? 0, peticion.color === 'verdes' ? 'selección verde' : peticion.color === 'rojas' ? 'selección roja' : 'selección', peticion.color === 'verdes' ? 'selecciones verdes' : peticion.color === 'rojas' ? 'selecciones rojas' : 'selecciones')} en ${plural(total, 'apuesta', 'apuestas')}`

  return (
    <div className="space-y-3 px-4 pb-6 pt-2">
      <FiltroFechas periodo={rango.periodo} desde={rango.desdeDia} hasta={rango.hastaDia} periodos={PERIODOS} />
      <div className="space-y-1 rounded-2xl border border-border bg-surface p-3">
        <p className="break-words text-base font-semibold" data-detalle="titulo">
          {d.titulo}
        </p>
        <p className="text-xs text-muted">
          {periodoTxt}
          {peticion.vista === 'aciertos' && peticion.tipo ? ` · ${NOMBRE_TIPO[peticion.tipo as TipoApuesta]}` : ''}
        </p>
        <p className="text-sm font-medium" data-detalle="recuento">
          {recuento}
        </p>
        <p className="text-xs text-muted">Solo las apuestas resueltas que cuentan en esta cifra (sin anuladas ni pendientes).</p>
      </div>

      {peticion.vista === 'aciertos' && (
        <nav aria-label="Color de las selecciones" className="grid grid-cols-3 gap-2">
          {(
            [
              ['todas', 'Todas'],
              ['verdes', 'Verdes'],
              ['rojas', 'Rojas'],
            ] as [Color, string][]
          ).map(([c, t]) => (
            <Link
              key={c}
              href={enlace(0, c)}
              replace
              aria-current={peticion.color === c ? 'page' : undefined}
              className={`flex h-11 items-center justify-center rounded-xl border text-sm font-semibold ${
                peticion.color === c ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'
              }`}
            >
              {t}
            </Link>
          ))}
        </nav>
      )}

      {total === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Ninguna apuesta con este color.</p>
      ) : (
        <ul className="space-y-2" data-detalle="lista">
          {visibles.map((a) => (
            <li key={a.id}>
              <TarjetaApuesta a={paraTarjeta(a)} volver={actual} />
            </li>
          ))}
        </ul>
      )}

      {total > POR_PAGINA && (
        <nav className="flex items-center justify-between text-sm">
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
              Más antiguas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}

// La misma tarjeta que la lista de Apuestas.
function paraTarjeta(a: ApuestaAnalisis): FilaApuesta {
  return {
    id: a.id,
    fecha: a.fecha,
    tipo: a.tipo as TipoApuesta,
    importe: a.importe,
    divisa: a.divisa,
    cuota_total: a.cuota_total,
    estado: a.estado as EstadoApuesta,
    resultado_economico: a.resultado_economico,
    casa: a.casa,
    deporte: a.deporte,
    en_directo: a.en_directo,
    precipitada: a.precipitada,
    promo_tipo: a.promo_tipo,
    n_selecciones: a.selecciones.length,
    primer_evento: a.selecciones[0]?.evento ?? null,
  }
}
