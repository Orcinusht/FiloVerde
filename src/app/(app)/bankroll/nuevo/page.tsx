import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { EditorMovimiento, EnlaceVolver } from '../editor'

export const metadata = { title: 'Nuevo movimiento · Bankroll · Filoverde' }

export default function Page({ searchParams }: PageProps<'/bankroll/nuevo'>) {
  return (
    <>
      <PageHeader
        title="Nuevo movimiento"
        accion={
          <Suspense fallback={null}>
            <EnlaceVolver sp={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="mx-4 h-80 animate-pulse rounded-2xl bg-surface" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contenido({ searchParams }: { searchParams: PageProps<'/bankroll/nuevo'>['searchParams'] }) {
  return <EditorMovimiento id={null} sp={await searchParams} />
}
