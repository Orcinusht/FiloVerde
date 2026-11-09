import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { usuarioActual } from '@/lib/server/capturas'
import { estadoApiFutbol, type EstadoApiFutbol } from '@/lib/server/api-futbol'
import { BotonComprobarApi } from './boton-comprobar-api'

// API-Football: si está conectada (nunca se enseña la clave), llamadas de hoy y restantes según la
// última respuesta de la API. Desde la app no se puede cambiar la clave (va en Vercel).
export async function ApiFutbol() {
  await connection()
  let e: EstadoApiFutbol | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (userId) e = await estadoApiFutbol(supabase, userId)
  } catch {
    e = null
  }
  const hora = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const num = (n: number) => new Intl.NumberFormat('es-ES').format(n)
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">API-Football</h2>
      <div className="rounded-xl border border-border bg-surface" data-ajustes-api-futbol="">
        {!e ? (
          <p className="px-4 py-3 text-sm text-muted">No se ha podido cargar el estado de API-Football.</p>
        ) : !e.configurada ? (
          <p className="px-4 py-3 text-sm text-muted">
            Sin configurar: el registro funciona como siempre. Para activarla, pon la clave en Vercel (variable API_FOOTBALL_KEY) y vuelve a desplegar.
          </p>
        ) : (
          <>
            <dl className="divide-y divide-border text-sm">
              <Fila nombre="Estado" valor="Conectada (clave configurada en el servidor)" />
              {e.proveedor === 'rapidapi' && <Fila nombre="Proveedor" valor="RapidAPI" />}
              <Fila nombre="Llamadas de hoy (tuyas)" valor={`${num(e.hoy?.llamadas ?? 0)} de ${num(e.tope)} como máximo`} />
              <Fila
                nombre="Restantes en tu cuenta de la API"
                valor={
                  e.hoy?.restantes == null
                    ? '— (aún sin respuesta hoy)'
                    : `${num(e.hoy.restantes)}${e.hoy.limite ? ` de ${num(e.hoy.limite)}` : ''}${e.hoy.actualizado ? ` · a las ${hora(e.hoy.actualizado)}` : ''}`
                }
              />
            </dl>
            <BotonComprobarApi />
            <p className="border-t border-border px-4 py-3 text-xs text-muted">
              Solo fútbol. Las llamadas de la API se cuentan por día (se reinician a la 1:00 de España en invierno, 2:00 en verano). Los partidos se guardan unas horas para no repetir llamadas.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-muted">{nombre}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  )
}
