import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { Analisis } from './analisis'

export const metadata = { title: 'Análisis · Filoverde' }

export default function Page({ searchParams }: PageProps<'/analisis'>) {
  return (
    <>
      <PageHeader title="Análisis" />
      <Suspense fallback={<Cargando />}>
        <Analisis searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function Cargando() {
  return (
    <div className="space-y-3 px-4 pt-2" aria-busy="true">
      <div className="h-11 animate-pulse rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  )
}
