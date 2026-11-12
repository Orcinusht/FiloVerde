import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerApuestasAnalisis, leerEnJuego, leerPrimeraFecha } from '@/lib/analisis/leer'
import {
  MUESTRA_MINIMA,
  SEGMENTOS,
  AGRUPACIONES_ACIERTO,
  aciertos,
  cuotaMediaTxt,
  enMadrid,
  esAgrupacionAcierto,
  esSegmentoSelector,
  porcentaje,
  rachaTxt,
  resumen,
  segmentar,
  type AgrupacionAcierto,
  type ApuestaAnalisis,
  type FilaAcierto,
  type FilaSegmento,
  type OrdenSegmento,
  type Segmento,
} from '@/lib/analisis/calculos'
import { enlaceBalance, enlaceDetalleAcierto, enlaceDetalleDia, enlaceDetalleSegmento } from '@/lib/analisis/direccion'
import { DIA_LARGO, diaCorto, diaSemana, hoyEnEspana, navegacionPeriodo, rangoAnalisis } from '@/lib/analisis/periodo'
import { balanceSemana, leerBsem, semana, type FilaDia, type Semana } from '@/lib/analisis/semana'
import { SelectorPeriodo } from '@/components/selector-periodo'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { NOMBRE_TIPO, TIPOS_APUESTA, esTipoApuesta } from '@/lib/apuestas/estados'
import { Selector } from './controles'
import { porDiaSemana, porMes } from '@/lib/analisis/evolucion'

type Busqueda = Promise<Record<string, string | string[] | undefined>>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export async function Analisis({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan
  const hoy = hoyEnEspana()
  const rango = rangoAnalisis(uno(sp.periodo), { desde: uno(sp.desde), hasta: uno(sp.hasta), ref: uno(sp.ref) })
  const seg: Segmento = esSegmentoSelector(uno(sp.seg)) ? (uno(sp.seg) as Segmento) : 'casa'
  const orden: OrdenSegmento = uno(sp.orden) === 'n' ? 'n' : 'beneficio'
  const tipo = esTipoApuesta(uno(sp.tipo)) ? uno(sp.tipo) : ''
  const ac: AgrupacionAcierto = esAgrupacionAcierto(uno(sp.ac)) ? (uno(sp.ac) as AgrupacionAcierto) : 'mercado'

  let apuestas: ApuestaAnalisis[] = []
  let pendientes = { n: 0, importe: 0 } // "En juego": todas, sin filtro de fechas
  // Balance diario de la semana: su propia semana (`bsem`), NO depende del periodo elegido.
  let sem: Semana = semana(0, hoy, null)
  let apuestasSemana: ApuestaAnalisis[] = []
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else {
      let primera: string | null
      ;[apuestas, pendientes, primera] = await Promise.all([
        leerApuestasAnalisis(supabase, userId, rango),
        leerEnJuego(supabase, userId),
        leerPrimeraFecha(supabase, userId),
      ])
      sem = semana(leerBsem(uno(sp.bsem)), hoy, primera ? enMadrid(primera).dia : null)
      apuestasSemana = await leerApuestasAnalisis(supabase, userId, sem)
    }
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
      <BalanceSemana sem={sem} apuestas={apuestasSemana} hoy={hoy} divisa={apuestasSemana[0]?.divisa ?? r.divisa} sp={sp} />

      <div className="flex items-center gap-3 pt-1" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Análisis del periodo</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <h2 className="sr-only">Análisis del periodo</h2>

      <SelectorPeriodo nav={navegacionPeriodo(rango, hoy)} hoy={hoy} />

      <ul className="space-y-1 rounded-2xl border border-border bg-surface p-3 text-xs text-muted">
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
          {pendientes.n > 0 && <Tarjeta titulo="En juego" valor={`${pendientes.n} · ${dinero(pendientes.importe)}`} aviso={AVISO_EN_JUEGO} />}
        </div>
      ) : (
        <>
          <section aria-labelledby="t-resumen" className="space-y-2">
            <h2 id="t-resumen" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Resumen
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Tarjeta titulo="Apuestas resueltas" valor={String(r.n)} />
              <Tarjeta titulo="En juego" valor={String(pendientes.n)} nota={pendientes.n ? dinero(pendientes.importe) : undefined} aviso={AVISO_EN_JUEGO} />
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

          <PorMesYDia apuestas={apuestas} dinero={dinero} enlace={(seg, clave) => enlaceDetalleSegmento(sp, seg, clave)} />

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
            <ListaSegmento tabla="segmentos" filas={segmentar(apuestas, seg, orden)} dinero={dinero} enlace={(clave) => enlaceDetalleSegmento(sp, seg, clave)} />
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

const AVISO_EN_JUEGO = 'Todas tus pendientes, sin filtro de fechas'

function Tarjeta({ titulo, valor, nota, tono, aviso }: { titulo: string; valor: string; nota?: string; tono?: number; aviso?: string }) {
  return (
    <div data-tarjeta={titulo} className="min-w-0 rounded-2xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${colorTono(tono)}`}>{valor}</p>
      {nota && <p className="mt-0.5 truncate text-xs text-muted">{nota}</p>}
      {aviso && (
        <p className="mt-1 text-[11px] leading-tight text-muted" data-aviso="en-juego">
          {aviso}
        </p>
      )}
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
  tabla,
  filas,
  dinero,
  enlace,
}: {
  tabla: string
  filas: FilaSegmento[]
  dinero: (c: number | null, s?: boolean) => string
  enlace: (clave: string) => string
}) {
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.beneficio)))
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" data-tabla={tabla}>
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

// ---------- Por mes y por día de la semana ----------

type Dinero = (c: number | null, s?: boolean) => string

// Las tablas por mes y por día de la semana del periodo elegido (la gráfica del beneficio
// acumulado está en la pestaña Gráficas).
function PorMesYDia({ apuestas, dinero, enlace }: { apuestas: ApuestaAnalisis[]; dinero: Dinero; enlace: (seg: Segmento, clave: string) => string }) {
  return (
    <section aria-labelledby="t-mes-dia" className="space-y-3" data-seccion="mes-dia">
      <h2 id="t-mes-dia" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Por mes y por día de la semana
      </h2>
      <h3 className="pt-1 text-sm font-medium">Por mes</h3>
      <ListaSegmento tabla="meses" filas={porMes(apuestas)} dinero={dinero} enlace={(clave) => enlace('mes', clave)} />
      <h3 className="pt-1 text-sm font-medium">Por día de la semana</h3>
      <ListaSegmento tabla="dias" filas={porDiaSemana(apuestas)} dinero={dinero} enlace={(clave) => enlace('dia', clave)} />
      <p className="text-xs text-muted">Meses y días en hora de España. Pulsa una fila para ver sus apuestas.</p>
    </section>
  )
}

// ---------- Balance diario de la semana ----------

// Tarjeta propia, arriba del todo. Su semana va en `?bsem=` (0 esta, -1 la anterior…) y no cambia
// con el selector de periodo. Cada fila abre el detalle con las apuestas de ese día.
function BalanceSemana({
  sem,
  apuestas,
  hoy,
  divisa,
  sp,
}: {
  sem: Semana
  apuestas: ApuestaAnalisis[]
  hoy: string
  divisa: string
  sp: Record<string, string | string[] | undefined>
}) {
  const { filas, total } = balanceSemana(apuestas, sem)
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.beneficio)))
  const dinero = (c: number, conSigno = false) => formatoImporte(c, divisa, { conSigno })
  const flecha = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-2xl'
  const apagada = `${flecha} opacity-30`
  return (
    <section aria-labelledby="t-balance" className="space-y-3 rounded-2xl border border-border bg-surface p-3" data-seccion="balance-semana">
      <div>
        <h2 id="t-balance" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Balance de la semana
        </h2>
        <p className="mt-1 text-xs text-muted" data-aviso="balance-independiente">
          No depende del periodo de abajo. Beneficio neto de cada día de lunes a domingo (hora de España), solo con apuestas
          resueltas y por la fecha de la apuesta.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {sem.hayAnterior ? (
          <Link href={enlaceBalance(sp, sem.bsem - 1)} replace scroll={false} aria-label="Semana anterior" data-bsem="anterior" className={flecha}>
            <span aria-hidden="true">‹</span>
          </Link>
        ) : (
          <span aria-disabled="true" aria-label="No hay semanas anteriores con apuestas" data-bsem="anterior" className={apagada}>
            <span aria-hidden="true">‹</span>
          </span>
        )}
        <div className="min-w-0 flex-1 text-center">
          <p className="break-words text-base font-semibold leading-tight" data-balance-titulo>
            {sem.titulo}
          </p>
          {sem.bsem >= -1 && <p className="text-xs text-muted">{sem.tramo.charAt(0).toUpperCase() + sem.tramo.slice(1)}</p>}
          {sem.bsem < 0 && (
            <Link href={enlaceBalance(sp, 0)} replace scroll={false} data-bsem="volver" className="mt-0.5 inline-flex h-8 items-center text-sm font-semibold text-brand">
              Volver a esta semana
            </Link>
          )}
        </div>
        {sem.haySiguiente ? (
          <Link href={enlaceBalance(sp, sem.bsem + 1)} replace scroll={false} aria-label="Semana siguiente" data-bsem="siguiente" className={flecha}>
            <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <span aria-disabled="true" aria-label="Es la semana en curso" data-bsem="siguiente" className={apagada}>
            <span aria-hidden="true">›</span>
          </span>
        )}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-background" data-tabla="balance-semana">
        {filas.map((f) => (
          <FilaBalance key={f.dia} f={f} max={max} hoy={hoy} dinero={dinero} href={f.n > 0 ? enlaceDetalleDia(sp, f.dia) : null} />
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-2 px-1" data-balance-total={total.beneficio} data-balance-n={total.n}>
        <p className="text-sm font-semibold">
          {sem.bsem === 0 ? 'Total hasta hoy' : 'Total de la semana'}
          <span className="ml-1 text-xs font-normal text-muted">· {total.n === 1 ? '1 apuesta' : `${total.n} apuestas`}</span>
        </p>
        <p className={`text-lg font-semibold tabular-nums ${colorTono(total.beneficio)}`}>{total.n ? dinero(total.beneficio, true) : '—'}</p>
      </div>
    </section>
  )
}

function FilaBalance({
  f,
  max,
  hoy,
  dinero,
  href,
}: {
  f: FilaDia
  max: number
  hoy: string
  dinero: (c: number, s?: boolean) => string
  href: string | null
}) {
  const nombre = `${DIA_LARGO[diaSemana(f.dia)].slice(0, 3)} ${diaCorto(f.dia, hoy)}`
  const contenido = (
    <>
      <div className="w-[4.75rem] shrink-0">
        <p className="text-sm font-medium">
          {nombre}
          {f.dia === hoy && <span className="sr-only"> (hoy)</span>}
        </p>
        <p className="text-xs text-muted">{f.n === 0 ? 'Sin apuestas' : f.n === 1 ? '1 apuesta' : `${f.n} apuestas`}</p>
      </div>
      <div className="relative h-3 min-w-0 flex-1 rounded-full bg-border/40" aria-hidden="true">
        <div className="absolute inset-y-0 left-1/2 w-px bg-muted/60" />
        {f.beneficio !== 0 && (
          <div
            className={`absolute inset-y-0 rounded-full ${f.beneficio > 0 ? 'left-1/2 bg-green-600 dark:bg-green-500' : 'right-1/2 bg-red-600 dark:bg-red-500'}`}
            style={{ width: `${(Math.abs(f.beneficio) / max) * 50}%` }}
          />
        )}
      </div>
      <p className={`w-[5.5rem] shrink-0 text-right text-sm font-semibold tabular-nums ${colorTono(f.beneficio)}`} data-balance-dia-beneficio={f.beneficio}>
        {f.n === 0 ? '—' : dinero(f.beneficio, true)}
      </p>
    </>
  )
  return (
    <li data-balance-dia={f.dia} data-balance-dia-n={f.n} className={f.dia === hoy ? 'bg-brand/5' : ''}>
      {href ? (
        <Link href={href} className="flex min-h-12 items-center gap-2 px-3 py-2 active:bg-surface">
          {contenido}
          <span aria-hidden="true" className="shrink-0 text-lg text-muted">
            ›
          </span>
        </Link>
      ) : (
        <div className="flex min-h-12 items-center gap-2 px-3 py-2 pr-7">{contenido}</div>
      )}
    </li>
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
