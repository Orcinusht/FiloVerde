import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerApuestasAnalisis } from '@/lib/analisis/leer'
import {
  MUESTRA_MINIMA,
  PERIODOS,
  SEGMENTOS,
  AGRUPACIONES_ACIERTO,
  aciertos,
  cuotaMediaTxt,
  esAgrupacionAcierto,
  esPeriodo,
  esSegmento,
  porcentaje,
  rachaTxt,
  rangoPeriodo,
  resumen,
  segmentar,
  type AgrupacionAcierto,
  type ApuestaAnalisis,
  type FilaAcierto,
  type FilaSegmento,
  type OrdenSegmento,
  type Segmento,
} from '@/lib/analisis/calculos'
import { enlaceDetalleAcierto, enlaceDetalleSegmento } from '@/lib/analisis/direccion'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { NOMBRE_TIPO, TIPOS_APUESTA, esTipoApuesta } from '@/lib/apuestas/estados'
import { FiltroFechas, Selector } from './controles'

type Busqueda = Promise<Record<string, string | string[] | undefined>>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export async function Analisis({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan
  const periodo = esPeriodo(uno(sp.periodo)) ? uno(sp.periodo) : 'todo'
  const rango = rangoPeriodo(periodo as keyof typeof PERIODOS, uno(sp.desde), uno(sp.hasta))
  const seg: Segmento = esSegmento(uno(sp.seg)) ? (uno(sp.seg) as Segmento) : 'casa'
  const orden: OrdenSegmento = uno(sp.orden) === 'n' ? 'n' : 'beneficio'
  const tipo = esTipoApuesta(uno(sp.tipo)) ? uno(sp.tipo) : ''
  const ac: AgrupacionAcierto = esAgrupacionAcierto(uno(sp.ac)) ? (uno(sp.ac) as AgrupacionAcierto) : 'mercado'

  let apuestas: ApuestaAnalisis[] = []
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else apuestas = await leerApuestasAnalisis(supabase, userId, rango)
  } catch (e) {
    registrarError('analisis:leer', e)
    fallo = 'error'
  }
  if (fallo === 'sesion') return <Aviso>Tu sesión ha caducado. Vuelve a entrar para ver tu análisis.</Aviso>
  if (fallo === 'error') return <Aviso>No se ha podido cargar el análisis. Recarga la página en unos segundos.</Aviso>

  const r = resumen(apuestas)
  const dinero = (c: number | null, conSigno = false) => formatoImporte(c, r.divisa, { conSigno })

  return (
    <div className="space-y-5 px-4 pb-6 pt-2">
      <FiltroFechas periodo={rango.periodo} desde={rango.desdeDia} hasta={rango.hastaDia} periodos={PERIODOS} />

      <ul className="space-y-1 rounded-2xl border border-border bg-surface p-3 text-xs text-muted">
        <li>Solo cuentan las apuestas resueltas del periodo; anuladas y pendientes quedan fuera (las pendientes salen en «En juego»).</li>
        <li>Lo no marcado como directo cuenta como pre-partido, y lo no marcado como precipitada cuenta como normal (las casillas las marcas tú).</li>
        <li>Con pocas apuestas las cifras engañan: no se saca ninguna conclusión con muestra pequeña (menos de {MUESTRA_MINIMA}).</li>
      </ul>

      {r.n === 0 ? (
        <div className="space-y-3">
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
            {rango.periodo === 'todo'
              ? 'Todavía no hay apuestas resueltas. Cuando marques alguna como ganada, perdida, media o cash out, aparecerá aquí.'
              : 'No hay apuestas resueltas en este periodo. Prueba con otro periodo o con «Todo».'}
          </p>
          {r.enJuego.n > 0 && <Tarjeta titulo="En juego" valor={`${r.enJuego.n} · ${dinero(r.enJuego.importe)}`} />}
        </div>
      ) : (
        <>
          <section aria-labelledby="t-resumen" className="space-y-2">
            <h2 id="t-resumen" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Resumen
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Tarjeta titulo="Apuestas resueltas" valor={String(r.n)} />
              <Tarjeta titulo="En juego" valor={String(r.enJuego.n)} nota={r.enJuego.n ? dinero(r.enJuego.importe) : undefined} />
              <Tarjeta titulo="Importe apostado" valor={dinero(r.importe)} />
              <Tarjeta titulo="Beneficio neto" valor={dinero(r.beneficio, true)} tono={r.beneficio} />
              <Tarjeta titulo="Yield" valor={porcentaje(r.yield)} tono={r.yield ?? 0} />
              <Tarjeta titulo="% de acierto" valor={porcentaje(r.acierto)} nota={`${r.ganadas} ganadas · ${r.perdidas} perdidas`} />
              <Tarjeta titulo="Cuota media" valor={cuotaMediaTxt(r.cuotaMedia)} />
              <Tarjeta titulo="Importe medio" valor={r.importeMedio == null ? '—' : dinero(Math.round(r.importeMedio))} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-xs text-muted">Rachas (solo con las apuestas del periodo elegido)</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Actual</dt>
                  <dd className="font-semibold">{rachaTxt(r.rachas.actual)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Mejor</dt>
                  <dd className="font-semibold">{r.rachas.mejor ? `${r.rachas.mejor} ganadas` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Peor</dt>
                  <dd className="font-semibold">{r.rachas.peor ? `${r.rachas.peor} perdidas` : '—'}</dd>
                </div>
              </dl>
            </div>
            {r.nCredito > 0 && (
              <p className="rounded-2xl border border-border bg-surface p-3 text-sm">
                Con crédito: {r.nCredito} {r.nCredito === 1 ? 'apuesta' : 'apuestas'}, {dinero(r.beneficioCredito)} obtenidos. Suman al
                beneficio neto, pero no entran en el importe apostado, el yield ni el % de acierto (su importe no era dinero propio).
              </p>
            )}
            {r.sinResultado > 0 && (
              <p role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                {r.sinResultado} {r.sinResultado === 1 ? 'apuesta resuelta no tiene' : 'apuestas resueltas no tienen'} resultado
                económico y no {r.sinResultado === 1 ? 'cuenta' : 'cuentan'}: revísalas en la lista.
              </p>
            )}
          </section>

          <section aria-labelledby="t-segmentos" className="space-y-2">
            <h2 id="t-segmentos" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Por segmento
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Selector nombre="seg" etiqueta="Segmento" valor={seg} opciones={Object.entries(SEGMENTOS)} />
              <Selector
                nombre="orden"
                etiqueta="Ordenar"
                valor={orden}
                opciones={[
                  ['beneficio', 'Por beneficio'],
                  ['n', 'Por nº de apuestas'],
                ]}
              />
            </div>
            {(seg === 'liga' || seg === 'mercado') && (
              <p className="text-xs text-muted">
                Una apuesta cuenta en {seg === 'liga' ? 'una liga' : 'un mercado'} solo si todas sus selecciones coinciden; si no, va a «Varios».
              </p>
            )}
            <p className="text-xs text-muted">Pulsa una fila para ver las apuestas que la forman.</p>
            <ListaSegmento filas={segmentar(apuestas, seg, orden)} dinero={dinero} enlace={(clave) => enlaceDetalleSegmento(sp, seg, clave)} />
          </section>

          <section aria-labelledby="t-aciertos" className="space-y-2">
            <h2 id="t-aciertos" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Aciertos por selección · {AGRUPACIONES_ACIERTO[ac]}
            </h2>
            <p className="text-xs text-muted">
              Selecciones ganadas (verdes) y perdidas (rojas) de apuestas resueltas, sin dinero (el dinero es de la apuesta, no
              de cada selección). Útil para ver qué condiciones fallan más.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Selector nombre="ac" etiqueta="Agrupar aciertos por" valor={ac} opciones={Object.entries(AGRUPACIONES_ACIERTO)} />
              <Selector
                nombre="tipo"
                etiqueta="Tipo de apuesta"
                valor={tipo}
                opciones={[['', 'Todos los tipos'], ...TIPOS_APUESTA.map((t) => [t, NOMBRE_TIPO[t]] as [string, string])]}
              />
            </div>
            <TablaAciertos filas={aciertos(apuestas, ac, tipo || undefined)} enlace={(clave) => enlaceDetalleAcierto(sp, ac, clave)} />
          </section>
        </>
      )}

      <p className="text-center text-xs text-muted">
        La app registra y analiza; no recomienda apuestas. <Link href="/apuestas" className="underline">Ver apuestas</Link>
      </p>
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mx-4 mt-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
      {children}
    </p>
  )
}

const colorTono = (tono?: number) =>
  tono == null || tono === 0 ? '' : tono > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'

function Tarjeta({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota?: string; tono?: number }) {
  return (
    <div data-tarjeta={titulo} className="min-w-0 rounded-2xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${colorTono(tono)}`}>{valor}</p>
      {nota && <p className="mt-0.5 truncate text-xs text-muted">{nota}</p>}
    </div>
  )
}

function MuestraPequena() {
  return (
    <span className="shrink-0 rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      Muestra pequeña
    </span>
  )
}

// Fila pulsable: abre el detalle con las apuestas que la forman.
function FilaEnlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 p-3 active:bg-background">
        <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
        <span aria-hidden="true" className="shrink-0 text-lg text-muted">
          ›
        </span>
      </Link>
    </li>
  )
}

// Barras horizontales de beneficio (verde positivo, rojo negativo) desde una línea central.
function ListaSegmento({
  filas,
  dinero,
  enlace,
}: {
  filas: FilaSegmento[]
  dinero: (c: number | null, s?: boolean) => string
  enlace: (clave: string) => string
}) {
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.beneficio)))
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" data-tabla="segmentos">
      {filas.map((f) => {
        const ancho = `${(Math.abs(f.beneficio) / max) * 50}%`
        return (
          <FilaEnlace key={f.clave} href={enlace(f.clave)}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-medium">{f.etiqueta}</p>
              {f.muestraPequena && <MuestraPequena />}
            </div>
            <div className="relative h-3 rounded-full bg-border/40" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-muted/60" />
              {f.beneficio !== 0 && (
                <div
                  className={`absolute inset-y-0 rounded-full ${f.beneficio > 0 ? 'left-1/2 bg-green-600 dark:bg-green-500' : 'right-1/2 bg-red-600 dark:bg-red-500'}`}
                  style={{ width: ancho }}
                />
              )}
            </div>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
              <Dato n="Apuestas" v={String(f.n)} />
              <Dato n="Apostado" v={dinero(f.importe)} />
              <Dato n="Beneficio" v={dinero(f.beneficio, true)} tono={f.beneficio} />
              <Dato n="Yield" v={porcentaje(f.yield)} />
              <Dato n="Acierto" v={porcentaje(f.acierto)} />
              {f.nCredito > 0 && <Dato n="Con crédito" v={String(f.nCredito)} />}
            </dl>
          </FilaEnlace>
        )
      })}
    </ul>
  )
}

function Dato({ n, v, tono, clase = '' }: { n: string; v: string; tono?: number; clase?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{n}</dt>
      <dd className={`truncate font-semibold tabular-nums ${clase || colorTono(tono)}`}>{v}</dd>
    </div>
  )
}

// Aciertos por selección (mercado o liga): verdes, rojas, % verdes y total. Sin dinero.
function TablaAciertos({ filas, enlace }: { filas: FilaAcierto[]; enlace: (clave: string) => string }) {
  if (filas.length === 0) {
    return <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">No hay selecciones ganadas o perdidas con este filtro.</p>
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" data-tabla="aciertos">
      {filas.map((f) => (
        <FilaEnlace key={f.clave} href={enlace(f.clave)}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium">{f.etiqueta}</p>
            {f.muestraPequena && <MuestraPequena />}
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-border/40" aria-hidden="true">
            <div className="bg-green-600 dark:bg-green-500" style={{ width: `${(f.verdes / f.n) * 100}%` }} />
            <div className="bg-red-600 dark:bg-red-500" style={{ width: `${(f.rojas / f.n) * 100}%` }} />
          </div>
          <dl className="grid grid-cols-4 gap-x-2 text-xs">
            <Dato n="Verdes" v={String(f.verdes)} clase="text-green-700 dark:text-green-400" />
            <Dato n="Rojas" v={String(f.rojas)} clase="text-red-600 dark:text-red-400" />
            <Dato n="% verdes" v={porcentaje(f.pctVerdes)} />
            <Dato n="Total" v={String(f.n)} />
          </dl>
        </FilaEnlace>
      ))}
    </ul>
  )
}
