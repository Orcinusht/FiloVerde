import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerTodoBankroll } from '@/lib/bankroll/leer'
import { NOMBRE_MOVIMIENTO, SIN_CASA, TIPOS_MOVIMIENTO, calcularBankroll, esTipoMovimiento } from '@/lib/bankroll/calculos'
import { AvisoError, BloqueCifras, eur, ListaMovimientos, Paginacion, TarjetaCasa } from './piezas'
import { FiltroDireccion } from './filtros'
import { FiltroFechas } from '../analisis/controles'
import { PERIODOS, esPeriodo, rangoPeriodo } from '@/lib/analisis/calculos'
import { curvaSaldo, indiceDia, textoDia, type ApuestaSaldo } from '@/lib/analisis/evolucion'
import { GraficaLinea } from '@/components/grafica-linea'

export const metadata = { title: 'Bankroll · Filoverde' }

type Busqueda = Promise<Record<string, string | string[] | undefined>>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const POR_PAGINA = 50

export default function Page({ searchParams }: PageProps<'/bankroll'>) {
  return (
    <>
      <PageHeader
        title="Bankroll"
        accion={
          <Link href="/bankroll/nuevo" className="flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground">
            + Movimiento
          </Link>
        }
      />
      <Suspense fallback={<Cargando />}>
        <Bankroll searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function Cargando() {
  return (
    <div className="space-y-3 px-4 pt-2" aria-busy="true">
      <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface" />
    </div>
  )
}

async function Bankroll({ searchParams }: { searchParams: Busqueda }) {
  const sp = await searchParams
  await connection() // datos del momento: nunca se prerenderizan
  let datos: Awaited<ReturnType<typeof leerTodoBankroll>> | null = null
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else datos = await leerTodoBankroll(supabase, userId)
  } catch (e) {
    registrarError('bankroll:leer', e)
    fallo = 'error'
  }
  if (fallo === 'sesion' || !datos) {
    return <AvisoError>{fallo === 'sesion' ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se ha podido cargar el bankroll. Recarga la página en unos segundos.'}</AvisoError>
  }

  const { casas, movimientos, apuestas } = datos
  const b = calcularBankroll(casas.map((c) => c.id), movimientos, apuestas)
  const porId = new Map(casas.map((c) => [c.id, c]))

  // Filtros de la lista (en la dirección).
  const casa = porId.has(uno(sp.casa)) ? uno(sp.casa) : ''
  const tipo = esTipoMovimiento(uno(sp.tipo)) ? uno(sp.tipo) : ''
  const pagina = Math.max(0, Math.min(10000, Number.parseInt(uno(sp.pagina) || '0', 10) || 0))
  const filtrados = movimientos.filter((m) => (!casa || m.casa_id === casa || m.casa_destino_id === casa) && (!tipo || m.tipo === tipo))
  const visibles = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  // Evolución del saldo: Global o una casa, en el periodo elegido (en la dirección).
  const evo = porId.has(uno(sp.evo)) ? uno(sp.evo) : ''
  const periodo = esPeriodo(uno(sp.periodo)) ? uno(sp.periodo) : 'todo'
  const rango = rangoPeriodo(periodo as keyof typeof PERIODOS, uno(sp.desde), uno(sp.hasta))

  const enlaceLista = (p: number) => {
    const q = new URLSearchParams()
    for (const k of ['evo', 'periodo', 'desde', 'hasta']) if (uno(sp[k])) q.set(k, uno(sp[k]))
    if (casa) q.set('casa', casa)
    if (tipo) q.set('tipo', tipo)
    if (p > 0) q.set('pagina', String(p))
    const s = q.toString()
    return s ? `/bankroll?${s}` : '/bankroll'
  }
  const actual = enlaceLista(pagina)

  return (
    <div className="space-y-5 px-4 pb-6 pt-2">
      {movimientos.length === 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-border bg-surface p-4 text-sm" data-vacio="bankroll">
          <p className="font-semibold">Registra tus depósitos y retiradas pasados para que el saldo y el ROI sean correctos.</p>
          <p className="text-muted">
            Puedes poner un depósito con fecha antigua como saldo inicial de cada casa. Pulsa «+ Movimiento» para empezar.
          </p>
        </div>
      )}

      <section aria-labelledby="t-global" className="space-y-2">
        <h2 id="t-global" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Global
        </h2>
        <BloqueCifras c={b.global} />
        <p className="text-xs text-muted">
          Saldo y ROI hasta hoy. Saldo = depósitos − retiradas ± ajustes + beneficio de las apuestas resueltas (los traspasos
          entre casas no cambian el global). ROI = beneficio de apuestas ÷ total depositado.
        </p>
      </section>

      <EvolucionSaldo
        movimientos={movimientos}
        apuestas={apuestas.filter((a) => a.id && a.fecha && a.created_at) as ApuestaSaldo[]}
        casaId={evo || null}
        casas={casas.map((c) => [c.id, c.nombre] as [string, string])}
        rango={rango}
      />

      <section aria-labelledby="t-casas" className="space-y-2">
        <h2 id="t-casas" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Por casa
        </h2>
        {casas.length === 0 && !b.sinCasa ? (
          <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">Aún no tienes casas. Créalas al añadir un movimiento.</p>
        ) : (
          <ul className="space-y-2">
            {casas.map((c) => (
              <TarjetaCasa key={c.id} href={`/bankroll/casa/${c.id}`} nombre={c.nombre} c={b.porCasa.get(c.id)!} archivada={c.archivada} />
            ))}
            {b.sinCasa && <TarjetaCasa href={`/bankroll/casa/${SIN_CASA}`} nombre="Sin casa" c={b.sinCasa} />}
          </ul>
        )}
        {b.sinCasa && (
          <p className="text-xs text-muted">«Sin casa»: apuestas sin casa asignada. Cuentan en el global, pero no en el saldo de ninguna casa.</p>
        )}
      </section>

      <section aria-labelledby="t-movimientos" className="space-y-2">
        <h2 id="t-movimientos" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Movimientos
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <FiltroDireccion
            nombre="casa"
            etiqueta="Filtrar por casa"
            valor={casa}
            opciones={[['', 'Todas las casas'], ...casas.map((c) => [c.id, c.nombre] as [string, string])]}
          />
          <FiltroDireccion
            nombre="tipo"
            etiqueta="Filtrar por tipo"
            valor={tipo}
            opciones={[['', 'Todos los tipos'], ...TIPOS_MOVIMIENTO.map((t) => [t, NOMBRE_MOVIMIENTO[t]] as [string, string])]}
          />
        </div>
        {filtrados.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
            {movimientos.length === 0 ? 'Todavía no hay movimientos.' : 'No hay movimientos con estos filtros.'}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted" data-recuento="movimientos">
              {filtrados.length === 1 ? '1 movimiento' : `${filtrados.length} movimientos`}
            </p>
            <ListaMovimientos
              movimientos={visibles}
              casas={porId}
              casaId={casa || undefined}
              enlace={(id) => `/bankroll/${id}?volver=${encodeURIComponent(actual)}`}
            />
            <Paginacion total={filtrados.length} pagina={pagina} porPagina={POR_PAGINA} enlace={enlaceLista} />
          </>
        )}
        <Link
          href={`/bankroll/nuevo?volver=${encodeURIComponent(actual)}`}
          className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold"
        >
          + Añadir movimiento
        </Link>
      </section>
    </div>
  )
}

function EvolucionSaldo({
  movimientos,
  apuestas,
  casaId,
  casas,
  rango,
}: {
  movimientos: Parameters<typeof curvaSaldo>[0]['movimientos']
  apuestas: ApuestaSaldo[]
  casaId: string | null
  casas: [string, string][]
  rango: ReturnType<typeof rangoPeriodo>
}) {
  const puntos = curvaSaldo({ movimientos, apuestas, casaId, desdeDia: rango.desdeDia, hastaDia: rango.hastaDia })
  const conMarcas = puntos.some((p) => p.depositos || p.retiradas)
  const grafica = puntos.map((p) => ({
    x: indiceDia(p.dia),
    y: p.valor,
    deposito: p.depositos > 0,
    retirada: p.retiradas > 0,
    texto: [
      p.inicial ? (rango.desdeDia ? 'Saldo antes del periodo' : 'Antes del primer movimiento') : textoDia(p.dia),
      `Saldo: ${eur(p.valor)}`,
      p.depositos ? `Depósitos: ${eur(p.depositos, true)}` : '',
      p.retiradas ? `Retiradas: ${eur(-p.retiradas, true)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }))
  return (
    <section aria-labelledby="t-evolucion-saldo" className="space-y-2" data-seccion="evolucion-saldo">
      <h2 id="t-evolucion-saldo" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Evolución del saldo
      </h2>
      <FiltroDireccion nombre="evo" etiqueta="Saldo de" valor={casaId ?? ''} opciones={[['', 'Global'], ...casas]} />
      <FiltroFechas periodo={rango.periodo} desde={rango.desdeDia} hasta={rango.hastaDia} periodos={PERIODOS} />
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
        {puntos.length === 0 ? (
          <p className="text-sm text-muted">No hay movimientos ni apuestas resueltas {rango.periodo === 'todo' ? 'todavía' : 'en este periodo'}.</p>
        ) : (
          <>
            <GraficaLinea
              id="saldo"
              titulo={`Evolución del saldo · ${casaId ? (casas.find(([id]) => id === casaId)?.[1] ?? 'Casa') : 'Global'}`}
              puntos={grafica}
              conMarcas={conMarcas}
              inicio={`${rango.desdeDia ? 'Antes' : 'Inicio'}: ${eur(puntos[0].valor)}`}
              fin={`${textoDia(puntos[puntos.length - 1].dia)}: ${eur(puntos[puntos.length - 1].valor)}`}
            />
            {conMarcas && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600 dark:bg-green-400" aria-hidden="true" /> Depósito
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-400" aria-hidden="true" /> Retirada
                </span>
              </p>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        Un punto por día. Parte del saldo acumulado antes del periodo y suma movimientos y resultados de apuestas resueltas en su
        fecha (las de fecha futura, hoy). En el global los traspasos no cuentan; las apuestas sin casa, solo en el global. Con
        «Todo», el último punto es el saldo de hoy.
      </p>
    </section>
  )
}
