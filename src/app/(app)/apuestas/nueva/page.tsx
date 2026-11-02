import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { listarCasas, listarEstrategias, listarPendientes } from '@/lib/server/datos'
import { RegistroCapturas } from '@/components/apuestas/registro-capturas'
import { NuevaManual } from '@/components/apuestas/editar-apuesta'

export const metadata = { title: 'Nueva apuesta · Filoverde' }
// Margen para las acciones de servidor de esta pantalla (guardar, crear casa…).
export const maxDuration = 60

export default function Page({ searchParams }: PageProps<'/apuestas/nueva'>) {
  return (
    <>
      <PageHeader
        title="Nueva apuesta"
        accion={
          <Link href="/apuestas" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            Cancelar
          </Link>
        }
      />
      <Suspense fallback={<div className="mx-4 h-40 animate-pulse rounded-2xl bg-surface" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contenido({ searchParams }: { searchParams: PageProps<'/apuestas/nueva'>['searchParams'] }) {
  const sp = await searchParams
  const manual = sp.manual === '1'
  const retomar = sp.pendientes === '1'
  const [casas, estrategias, pendientes] = await Promise.all([
    listarCasas(),
    listarEstrategias(),
    retomar ? listarPendientes() : Promise.resolve([]),
  ])
  if (manual) return <NuevaManual casas={casas} estrategias={estrategias} />
  return <RegistroCapturas casas={casas} estrategias={estrategias} pendientes={pendientes} />
}
