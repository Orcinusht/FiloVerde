import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerCatalogo, leerSeleccionesCatalogo } from '@/lib/server/catalogo'
import { detectarPosiblesErrores, usoCatalogo, type Uso } from '@/lib/apuestas/catalogo-gestion'
import type { Catalogo } from '@/lib/apuestas/catalogo'
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
          Renombrar cambia el nombre en el catálogo y también en tus apuestas (te avisa antes de cuántas). Solo se puede
          borrar lo que no se usa; si ya se usa, puedes archivarlo.
        </p>
        <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface" />}>
          <Contenido />
        </Suspense>
      </div>
    </>
  )
}

async function Contenido() {
  await connection()
  let datos: { catalogo: Catalogo; uso: Record<string, Uso>; nRevisar: number } | null = null
  let sinSesion = false
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) sinSesion = true
    else {
      const [catalogo, selecciones] = await Promise.all([leerCatalogo(supabase), leerSeleccionesCatalogo(supabase, userId)])
      datos = { catalogo, uso: Object.fromEntries(usoCatalogo(catalogo, selecciones)), nRevisar: detectarPosiblesErrores(selecciones).length }
    }
  } catch (e) {
    registrarError('deportes:leer', e)
  }
  if (!datos) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
        {sinSesion ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se ha podido cargar el catálogo. Recarga la página en unos segundos.'}
      </p>
    )
  }
  return <EditorCatalogo catalogo={datos.catalogo} uso={datos.uso} nRevisar={datos.nRevisar} />
}
