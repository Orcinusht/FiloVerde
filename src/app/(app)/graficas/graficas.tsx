import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerApuestasAnalisis } from '@/lib/analisis/leer'
import { leerCasas, type Casa } from '@/lib/bankroll/leer'
import { PERIODOS, SEGMENTOS, esPeriodo, esSegmentoSelector, porcentaje, rangoPeriodo, type ApuestaAnalisis, type Segmento } from '@/lib/analisis/calculos'
import { enlaceDetalleGraficas } from '@/lib/analisis/direccion'
import { textoDia } from '@/lib/analisis/evolucion'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { formatoFecha } from '@/lib/apuestas/fechas'
import {
  CASA_SIN,
  SERIES_POR_TANDA,
  curvaGrafica,
  dominioFechas,
  escalaComun,
  filtrarCasa,
  leerCasa,
  seriesPorSegmento,
  seriesVisibles,
  type Curva,
  type OrdenSeries,
} from '@/lib/graficas/series'
import { enMadrid } from '@/lib/analisis/calculos'
import { GraficaLinea } from '@/components/grafica-linea'
import { Conmutador, FiltroFechas, Selector } from '../analisis/controles'

// Pestaña Gráficas (Fase 3, segunda ronda, parte 4). Todo en la dirección: casa, periodo, segmento,
// orden, escala y cuántas series se ven ("mas"). El servidor lee con la sesión del usuario (RLS),
// en tandas de 1000, y calcula con las mismas funciones que Análisis.

type Busqueda = Promise<Record<string, string | string[] | undefined>>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const eur = (c: number, signo = false) => formatoImporte(c, 'EUR', { conSigno: signo })
const PARAMS = ['casa', 'periodo', 'desde', 'hasta', 'seg', 'orden', 'escala', 'mas'] as const

export async function Graficas({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan
  const periodo = esPeriodo(uno(sp.periodo)) ? uno(sp.periodo) : 'todo'
  const rango = rangoPeriodo(periodo as keyof typeof PERIODOS, uno(sp.desde), uno(sp.hasta))
  const casa = leerCasa(uno(sp.casa))
  const orden: OrdenSeries = uno(sp.orden) === 'beneficio' ? 'beneficio' : 'n'
  const misma = uno(sp.escala) === 'misma'
  let seg: Segmento = esSegmentoSelector(uno(sp.seg)) ? (uno(sp.seg) as Segmento) : 'cuota'
  if (casa && seg === 'casa') seg = 'cuota' // con una casa elegida, "Casa" no tiene sentido

  let todas: ApuestaAnalisis[] = []
  let casas: Casa[] = []
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else [todas, casas] = await Promise.all([leerApuestasAnalisis(supabase, userId, rango), leerCasas(supabase, userId)])
  } catch (e) {
    registrarError('graficas:leer', e)
    fallo = 'error'
  }
  if (fallo === 'sesion') return <Aviso>Tu sesión ha caducado. Vuelve a entrar para ver tus gráficas.</Aviso>
  if (fallo === 'error') return <Aviso>No se han podido cargar las gráficas. Recarga la página en unos segundos.</Aviso>

  // Una casa que no es tuya (o que ya no existe) se trata como "Todas".
  const casaValida = casa === '' || casa === CASA_SIN || casas.some((c) => c.id === casa) ? casa : ''
  const apuestas = filtrarCasa(todas, casaValida)
  const haySinCasa = casaValida === CASA_SIN || todas.some((a) => !a.casa_id)

  // Dirección de esta misma pantalla con algún cambio (para "Ver más" y para volver del detalle).
  const aqui = (cambios: Record<string, string> = {}) => {
    const q = new URLSearchParams()
    for (const k of PARAMS) {
      const v = k in cambios ? cambios[k] : uno(sp[k])
      if (v) q.set(k, v)
    }
    const s = q.toString()
    return s ? `/graficas?${s}` : '/graficas'
  }

  const dominio = dominioFechas(apuestas)
  const opcionesCasa: [string, string][] = [
    ['', 'Todas las casas'],
    ...casas.map((c) => [c.id, c.archivada ? `${c.nombre} (archivada)` : c.nombre] as [string, string]),
    ...(haySinCasa ? [[CASA_SIN, 'Sin casa'] as [string, string]] : []),
  ]

  return (
    <div className="space-y-5 px-4 pb-6 pt-2">
      <FiltroFechas periodo={rango.periodo} desde={rango.desdeDia} hasta={rango.hastaDia} periodos={PERIODOS} />
      <Selector nombre="casa" etiqueta="Casa" valor={casaValida} opciones={opcionesCasa} />

      {!dominio ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm" data-vacio="graficas">
          {rango.periodo === 'todo' && !casaValida
            ? 'Todavía no hay apuestas resueltas. Cuando marques alguna como ganada, perdida, media o cash out, aparecerá aquí.'
            : 'No hay apuestas resueltas con este periodo y esta casa. Prueba con otro periodo o con «Todas las casas».'}
        </p>
      ) : (
        <>
          <BloqueBeneficio curva={curvaGrafica(apuestas, dominio[0])} dominio={dominio} />
          <Segmentos
            apuestas={apuestas}
            seg={seg}
            orden={orden}
            misma={misma}
            dominio={dominio}
            mas={uno(sp.mas)}
            conCasa={!casaValida}
            aqui={aqui}
            sp={sp}
          />
        </>
      )}

      <p className="text-center text-xs text-muted">
        Fecha de la apuesta, en hora de España. Solo apuestas resueltas. La app registra y analiza; no recomienda apuestas.
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

const colorTono = (v: number) => (v > 0 ? 'text-green-700 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : '')
const fecha = (iso: string) => formatoFecha(iso, { conHora: false })
const diaDe = (ms: number) => textoDia(enMadrid(new Date(ms).toISOString()).dia)

// Gráfica general + mayor caída y caída actual (antes en Análisis).
function BloqueBeneficio({ curva, dominio }: { curva: Curva; dominio: [number, number] }) {
  const tramo = (importe: number | null, desde: string | null, hasta: string | null) =>
    importe == null ? undefined : importe === 0 ? 'Sin caídas' : `${desde ? fecha(desde) : 'Inicio del periodo'} → ${hasta ? fecha(hasta) : ''}`
  return (
    <section aria-labelledby="t-beneficio" className="space-y-2" data-seccion="beneficio">
      <h2 id="t-beneficio" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Beneficio acumulado
      </h2>
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted">{curva.porDia ? 'Un punto por día.' : 'Un punto por apuesta.'} Toca la gráfica.</span>
          <span className={`text-lg font-semibold tabular-nums ${colorTono(curva.final)}`} data-final={curva.final}>
            {eur(curva.final, true)}
          </span>
        </p>
        <GraficaLinea
          id="beneficio"
          titulo={`Beneficio acumulado, final ${eur(curva.final, true)}`}
          puntos={curva.puntos}
          tono={curva.tono}
          dominioX={dominio}
          inicio={diaDe(dominio[0])}
          fin={`${diaDe(dominio[1])} · Final: ${eur(curva.final, true)}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tarjeta
          titulo="Mayor caída desde un máximo"
          valor={curva.caidaMaxima == null ? '—' : eur(curva.caidaMaxima)}
          nota={tramo(curva.caidaMaxima, curva.desdeMaxima, curva.hastaMaxima)}
        />
        <Tarjeta
          titulo="Caída actual desde el máximo"
          valor={curva.caidaActual == null ? '—' : eur(curva.caidaActual)}
          nota={tramo(curva.caidaActual, curva.desdeActual, curva.hastaActual)}
        />
      </div>
      <p className="text-xs text-muted">Caída: lo que baja el beneficio acumulado desde su punto más alto, apuesta a apuesta (se empieza en 0).</p>
    </section>
  )
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div data-tarjeta={titulo} className="min-w-0 rounded-2xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 truncate text-xs text-muted">{nota}</p>}
    </div>
  )
}

function Segmentos({
  apuestas,
  seg,
  orden,
  misma,
  dominio,
  mas,
  conCasa,
  aqui,
  sp,
}: {
  apuestas: ApuestaAnalisis[]
  seg: Segmento
  orden: OrdenSeries
  misma: boolean
  dominio: [number, number]
  mas: string
  conCasa: boolean
  aqui: (c?: Record<string, string>) => string
  sp: Record<string, string | string[] | undefined>
}) {
  const total = seriesPorSegmento(apuestas, seg, orden, dominio[0], 0).total
  const n = seriesVisibles(total, mas)
  const { series } = seriesPorSegmento(apuestas, seg, orden, dominio[0], n)
  const escala = misma ? escalaComun(series.map((s) => s.curva)) : undefined
  const opciones = Object.entries(SEGMENTOS).filter(([k]) => conCasa || k !== 'casa') as [string, string][]
  const volver = aqui()
  return (
    <section aria-labelledby="t-series" className="space-y-3" data-seccion="series">
      <h2 id="t-series" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Por segmento
      </h2>
      <Selector nombre="seg" etiqueta="Segmento" valor={seg} opciones={opciones} />
      <div className="space-y-2">
        <Conmutador
          nombre="orden"
          etiqueta="Ordenar"
          valor={orden}
          opciones={[
            ['n', 'Más apuestas'],
            ['beneficio', 'Beneficio'],
          ]}
        />
        <Conmutador
          nombre="escala"
          etiqueta="Escala del eje de euros"
          valor={misma ? 'misma' : 'propia'}
          opciones={[
            ['propia', 'Escala propia'],
            ['misma', 'Misma escala'],
          ]}
        />
      </div>
      {(seg === 'liga' || seg === 'mercado') && (
        <p className="text-xs text-muted">
          Una apuesta cuenta en {seg === 'liga' ? 'una liga' : 'un mercado'} solo si todas sus selecciones coinciden; si no, va a «Varios».
        </p>
      )}
      <p className="text-xs text-muted" data-recuento="series">
        {total === 1 ? '1 valor' : `${total} valores`} · todas con el mismo eje de fechas ({diaDe(dominio[0])} – {diaDe(dominio[1])}). Pulsa
        la cabecera para ver sus apuestas.
      </p>
      <ul className="space-y-3" data-lista="series">
        {series.map((s) => (
          <li key={s.clave} className="rounded-2xl border border-border bg-surface" data-serie={s.etiqueta} data-n={s.n} data-beneficio={s.beneficio}>
            <Link href={enlaceDetalleGraficas(sp, seg, s.clave, volver)} className="flex items-center gap-2 p-3 pb-1 active:bg-background">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium">{s.etiqueta}</p>
                  {s.muestraPequena && (
                    <span className="shrink-0 rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Muestra pequeña
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-4 gap-x-2 text-xs">
                  <Dato n="Apuestas" v={String(s.n)} />
                  <Dato n="Beneficio" v={eur(s.beneficio, true)} clase={colorTono(s.beneficio)} />
                  <Dato n="Yield" v={porcentaje(s.yield)} />
                  <Dato n="Mayor caída" v={s.curva.caidaMaxima == null ? '—' : eur(s.curva.caidaMaxima)} />
                </dl>
              </div>
              <span aria-hidden="true" className="shrink-0 text-lg text-muted">
                ›
              </span>
            </Link>
            <div className="px-3 pb-3">
              <GraficaLinea
                id={`serie-${s.clave}`}
                bajo
                titulo={`${s.etiqueta}: ${s.n} ${s.n === 1 ? 'apuesta' : 'apuestas'}, beneficio ${eur(s.beneficio, true)}, yield ${porcentaje(s.yield)}`}
                puntos={s.curva.puntos}
                tono={s.curva.tono}
                dominioX={dominio}
                dominioY={escala}
                inicio={diaDe(dominio[0])}
                fin={diaDe(dominio[1])}
              />
            </div>
          </li>
        ))}
      </ul>
      {n < total && (
        <Link
          href={aqui({ mas: String(n + SERIES_POR_TANDA) })}
          replace
          scroll={false}
          className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold"
          data-ver-mas=""
        >
          Ver más ({total - n} {total - n === 1 ? 'queda' : 'quedan'})
        </Link>
      )}
    </section>
  )
}

function Dato({ n, v, clase = '' }: { n: string; v: string; clase?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted">{n}</dt>
      <dd className={`truncate font-semibold tabular-nums ${clase}`}>{v}</dd>
    </div>
  )
}
