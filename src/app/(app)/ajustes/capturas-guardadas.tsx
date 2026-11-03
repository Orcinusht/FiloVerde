import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { usuarioActual } from '@/lib/server/capturas'
import { clasificarCapturas } from '@/lib/server/limpieza'
import { BotonBorrarCapturas } from './boton-borrar-capturas'

// Capturas que siguen en Storage. Desde ahora se borran solas al guardar; aquí se ven (y se
// pueden borrar) las antiguas. Las de apuestas pendientes de revisar no se tocan nunca.
export async function CapturasGuardadas() {
  await connection()
  let c: Awaited<ReturnType<typeof clasificarCapturas>> | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (userId) c = await clasificarCapturas(supabase, userId)
  } catch {
    c = null
  }

  const mb = (lista: { bytes: number }[]) => {
    const bytes = lista.reduce((s, a) => s + a.bytes, 0)
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  }
  const n = (k: number, una: string, varias: string) => `${k} ${k === 1 ? una : varias}`

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Capturas guardadas</h2>
      <div className="rounded-xl border border-border bg-surface">
        {!c ? (
          <p className="px-4 py-3 text-sm text-muted">No se ha podido consultar.</p>
        ) : (
          <>
            <dl className="divide-y divide-border text-sm">
              <Fila nombre="De apuestas guardadas o descartadas" valor={c.guardadas.length ? `${c.guardadas.length} · ${mb(c.guardadas)}` : '0'} />
              {c.sinEnlace.length > 0 && (
                <Fila nombre="Sin enlace en la base de datos" valor={`${c.sinEnlace.length} · ${mb(c.sinEnlace)}`} />
              )}
              <Fila
                nombre="Pendientes de revisar (no se borran)"
                valor={c.pendientes.length ? `${c.pendientes.length} · ${mb(c.pendientes)}` : '0'}
              />
              {c.recientes.length > 0 && (
                <Fila nombre="Recién subidas (no se borran)" valor={String(c.recientes.length)} />
              )}
            </dl>
            {c.sinEnlace.length > 0 && (
              <p className="border-t border-border px-4 py-3 text-xs text-muted">
                Storage tiene {n(c.sinEnlace.length, 'archivo', 'archivos')} que la base de datos no enlaza (restos de
                capturas antiguas).
              </p>
            )}
            <div className="border-t border-border p-3">
              <BotonBorrarCapturas
                total={c.guardadas.length + c.sinEnlace.length}
                tamano={mb([...c.guardadas, ...c.sinEnlace])}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="min-w-0 text-muted">{nombre}</dt>
      <dd className="shrink-0 text-right font-medium">{valor}</dd>
    </div>
  )
}
