import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { obtenerCatalogo } from '@/lib/server/datos'
import { EditorCatalogo } from './editor-catalogo'

export const metadata = { title: 'Deportes y ligas · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Deportes y ligas"
        accion={
          <Link href="/ajustes" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            ← Ajustes
          </Link>
        }
      />
      <div className="px-4 pt-2">
        <p className="mb-4 text-sm text-muted">
          Renombra o borra lo creado por error. Tus apuestas guardadas no cambian: conservan el nombre con el que se
          guardaron.
        </p>
        <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface" />}>
          <Contenido />
        </Suspense>
      </div>
    </>
  )
}

async function Contenido() {
  return <EditorCatalogo catalogo={await obtenerCatalogo()} />
}
