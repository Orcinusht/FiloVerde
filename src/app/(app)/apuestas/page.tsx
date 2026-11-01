import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { ListaApuestas } from '@/components/apuestas/lista-apuestas'

export const metadata = { title: 'Apuestas · Filoverde' }

export default function Page({ searchParams }: PageProps<'/apuestas'>) {
  return (
    <>
      <PageHeader
        title="Apuestas"
        accion={
          <Link
            href="/apuestas/nueva"
            className="flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground"
          >
            + Nueva
          </Link>
        }
      />
      <Suspense fallback={<Cargando />}>
        <ListaApuestas searchParams={searchParams} />
      </Suspense>
    </>
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
