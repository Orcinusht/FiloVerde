import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerOpciones, usoDeTodas } from '@/lib/server/opciones'
import type { TipoOpcion } from '@/lib/apuestas/opciones'
import { GestionOpciones, type FilaOpcion } from './gestion-opciones'

// Pantalla de Ajustes → "Casas de apuestas" o "Estrategias" (mismo diseño).
export function PaginaOpciones({ tipo }: { tipo: TipoOpcion }) {
  return (
    <>
      <PageHeader
        title={tipo === 'casa' ? 'Casas de apuestas' : 'Estrategias'}
        accion={
          <Link href="/ajustes" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            ← Ajustes
          </Link>
        }
      />
      <div className="px-4 pb-6 pt-2">
        <p className="mb-4 text-sm text-muted">
          Renombrar cambia el nombre en toda la app sin alterar ninguna cifra. Solo se puede borrar
          {tipo === 'casa' ? ' una casa sin apuestas ni movimientos' : ' una estrategia sin apuestas'}; si ya se usa, puedes
          archivarla para que no salga al crear apuestas nuevas.
        </p>
        <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface" />}>
          <Contenido tipo={tipo} />
        </Suspense>
      </div>
    </>
  )
}

async function Contenido({ tipo }: { tipo: TipoOpcion }) {
  await connection()
  let filas: FilaOpcion[] | null = null
  let sinSesion = false
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) sinSesion = true
    else {
      const [opciones, uso] = await Promise.all([leerOpciones(supabase, userId, tipo), usoDeTodas(supabase, userId, tipo)])
      filas = opciones.map((o) => ({ id: o.id, nombre: o.nombre, archivada: Boolean(o.archivada), uso: uso.get(o.id) ?? { apuestas: 0, movimientos: 0 } }))
    }
  } catch (e) {
    registrarError(tipo === 'casa' ? 'casas:leer' : 'estrategias:leer', e)
  }
  if (!filas) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
        {sinSesion ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se ha podido cargar la lista. Recarga la página en unos segundos.'}
      </p>
    )
  }
  return <GestionOpciones tipo={tipo} filas={filas} />
}
