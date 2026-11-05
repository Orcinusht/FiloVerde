import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerTodoBankroll } from '@/lib/bankroll/leer'
import { SIN_CASA, calcularBankroll } from '@/lib/bankroll/calculos'
import { AvisoError, BloqueCifras, ListaMovimientos, Paginacion } from '../../piezas'

export const metadata = { title: 'Casa · Bankroll · Filoverde' }

const POR_PAGINA = 50

export default function Page({ params, searchParams }: PageProps<'/bankroll/casa/[id]'>) {
  return (
    <>
      <PageHeader
        title="Casa"
        accion={
          <Link href="/bankroll" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            ← Bankroll
          </Link>
        }
      />
      <Suspense fallback={<div className="mx-4 h-60 animate-pulse rounded-2xl bg-surface" />}>
        <DetalleCasa params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function DetalleCasa({
  params,
  searchParams,
}: {
  params: PageProps<'/bankroll/casa/[id]'>['params']
  searchParams: PageProps<'/bankroll/casa/[id]'>['searchParams']
}) {
  const { id } = await params
  const sp = await searchParams
  await connection()
  let datos: Awaited<ReturnType<typeof leerTodoBankroll>> | null = null
  let fallo: 'sesion' | 'error' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else datos = await leerTodoBankroll(supabase, userId)
  } catch (e) {
    registrarError('bankroll:casa', e)
    fallo = 'error'
  }
  if (fallo === 'sesion' || !datos) {
    return <AvisoError>{fallo === 'sesion' ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se ha podido cargar la casa. Recarga la página en unos segundos.'}</AvisoError>
  }

  const { casas, movimientos, apuestas } = datos
  const b = calcularBankroll(casas.map((c) => c.id), movimientos, apuestas)
  const porId = new Map(casas.map((c) => [c.id, c]))

  if (id === SIN_CASA) {
    return (
      <div className="space-y-4 px-4 pb-6 pt-2">
        {b.sinCasa ? (
          <BloqueCifras c={b.sinCasa} titulo="Sin casa" />
        ) : (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm">No tienes apuestas sin casa.</p>
        )}
        <p className="text-xs text-muted">
          Apuestas sin casa asignada: su beneficio cuenta en el global, pero no en el saldo de ninguna casa. Si sabes de qué
          casa son, ponle la casa en la apuesta.
        </p>
        <Link href="/apuestas?casa=sin" className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold">
          Ver sus apuestas →
        </Link>
      </div>
    )
  }

  const casa = porId.get(id)
  if (!casa) {
    return (
      <div className="mx-4 mt-4 space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p>Esta casa no existe.</p>
        <Link href="/bankroll" className="inline-flex h-11 items-center font-semibold text-brand">
          Volver al bankroll
        </Link>
      </div>
    )
  }

  const c = b.porCasa.get(id)!
  const suyos = movimientos.filter((m) => m.casa_id === id || m.casa_destino_id === id)
  const p = Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina
  const pagina = Math.max(0, Math.min(10000, Number.parseInt(p || '0', 10) || 0))
  const enlace = (n: number) => (n > 0 ? `/bankroll/casa/${id}?pagina=${n}` : `/bankroll/casa/${id}`)
  const actual = enlace(pagina)

  return (
    <div className="space-y-4 px-4 pb-6 pt-2">
      <BloqueCifras c={c} titulo={casa.nombre} />
      <p className="text-xs text-muted">
        Saldo = depósitos − retiradas ± ajustes + traspasos recibidos − traspasos enviados + beneficio de sus apuestas resueltas.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/apuestas?casa=${id}`} className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold">
          Ver sus apuestas →
        </Link>
        <Link
          href={`/bankroll/nuevo?casa=${id}&volver=${encodeURIComponent(actual)}`}
          className="flex h-12 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-brand-foreground"
        >
          + Movimiento
        </Link>
      </div>
      <section aria-labelledby="t-mov-casa" className="space-y-2">
        <h2 id="t-mov-casa" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Sus movimientos
        </h2>
        {suyos.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">Esta casa aún no tiene movimientos.</p>
        ) : (
          <>
            <p className="text-xs text-muted" data-recuento="movimientos">
              {suyos.length === 1 ? '1 movimiento' : `${suyos.length} movimientos`} (los traspasos, con su efecto en esta casa)
            </p>
            <ListaMovimientos
              movimientos={suyos.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)}
              casas={porId}
              casaId={id}
              enlace={(m) => `/bankroll/${m}?volver=${encodeURIComponent(actual)}`}
            />
            <Paginacion total={suyos.length} pagina={pagina} porPagina={POR_PAGINA} enlace={enlace} />
          </>
        )}
      </section>
    </div>
  )
}
