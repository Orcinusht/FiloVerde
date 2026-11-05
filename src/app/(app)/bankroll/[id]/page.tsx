import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { EditorMovimiento, EnlaceVolver } from '../editor'

export const metadata = { title: 'Movimiento · Bankroll · Filoverde' }

export default function Page({ params, searchParams }: PageProps<'/bankroll/[id]'>) {
  return (
    <>
      <PageHeader
        title="Movimiento"
        accion={
          <Suspense fallback={null}>
            <EnlaceVolver sp={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="mx-4 h-80 animate-pulse rounded-2xl bg-surface" />}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contenido({
  params,
  searchParams,
}: {
  params: PageProps<'/bankroll/[id]'>['params']
  searchParams: PageProps<'/bankroll/[id]'>['searchParams']
}) {
  const { id } = await params
  return <EditorMovimiento id={id} sp={await searchParams} />
}
