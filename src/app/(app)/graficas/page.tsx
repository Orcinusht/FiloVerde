import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { Graficas } from './graficas'

export const metadata = { title: 'Gráficas · Filoverde' }

export default function Page({ searchParams }: PageProps<'/graficas'>) {
  return (
    <>
      <PageHeader title="Gráficas" />
      <Suspense fallback={<Cargando />}>
        <Graficas searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function Cargando() {
  return (
    <div className="space-y-3 px-4 pt-2" aria-busy="true">
      <div className="h-11 animate-pulse rounded-xl bg-surface" />
      <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface" />
    </div>
  )
}
