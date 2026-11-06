import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { PageHeader } from '@/components/page-header'
import { TarjetaApuesta } from '@/components/apuestas/tarjeta-apuesta'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { leerSeleccionesCatalogo } from '@/lib/server/catalogo'
import type { FilaApuesta } from '@/lib/server/datos'
import { detectarPosiblesErrores, SIN_LIGA, type GrupoSospechoso, type SeleccionCatalogo } from '@/lib/apuestas/catalogo-gestion'
import type { EstadoApuesta, TipoApuesta } from '@/lib/apuestas/estados'

export const metadata = { title: 'Revisar posibles errores · Filoverde' }

const VOLVER = '/ajustes/deportes/revisar'

export default function Page() {
  return (
    <>
      <PageHeader
        title="Posibles errores"
        accion={
          <Link href="/ajustes/deportes" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            ← Deportes
          </Link>
        }
      />
      <div className="space-y-4 px-4 pb-8 pt-2">
        <p className="text-sm text-muted">
          Selecciones del <strong>mismo partido</strong> (mismo texto, sin mayúsculas ni tildes, con «vs» y «-» iguales) y la
          <strong> misma fecha</strong> que tienen ligas o deportes distintos. Es una pista, no un error seguro: solo junta
          partidos escritos igual y no ve las selecciones sin fecha del evento. Abre cada apuesta para corregirla a mano.
        </p>
        <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface" />}>
          <Lista />
        </Suspense>
      </div>
    </>
  )
}

const fechaLarga = (dia: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`))

async function Lista() {
  await connection()
  let grupos: GrupoSospechoso[] = []
  let selecciones: SeleccionCatalogo[] = []
  const apuestas = new Map<string, FilaApuesta>()
  let fallo: string | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'Tu sesión ha caducado. Vuelve a entrar.'
    else {
      selecciones = await leerSeleccionesCatalogo(supabase, userId)
      grupos = detectarPosiblesErrores(selecciones)
      const ids = [...new Set(grupos.flatMap((g) => g.apuestas))]
      const [casas, ...lotes] = await Promise.all([
        supabase.from('casas_apuestas').select('id, nombre').eq('user_id', userId),
        ...Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) =>
          supabase
            .from('apuestas')
            .select('id, fecha, tipo, importe, divisa, cuota_total, estado, resultado_economico, casa_id, deporte, en_directo, precipitada, promo_tipo')
            .eq('user_id', userId)
            .in('id', ids.slice(i * 150, (i + 1) * 150)),
        ),
      ])
      if (casas.error) throw casas.error
      const nombreCasa = new Map((casas.data ?? []).map((c) => [c.id, c.nombre]))
      for (const l of lotes) {
        if (l.error) throw l.error
        for (const a of l.data ?? []) {
          const suyas = selecciones.filter((s) => s.apuesta_id === a.id).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
          apuestas.set(a.id, {
            id: a.id,
            fecha: a.fecha,
            tipo: a.tipo as TipoApuesta,
            importe: Number(a.importe),
            divisa: a.divisa,
            cuota_total: a.cuota_total == null ? null : Number(a.cuota_total),
            estado: a.estado as EstadoApuesta,
            resultado_economico: a.resultado_economico == null ? null : Number(a.resultado_economico),
            casa: a.casa_id ? (nombreCasa.get(a.casa_id) ?? null) : null,
            deporte: a.deporte,
            en_directo: a.en_directo,
            precipitada: a.precipitada,
            promo_tipo: a.promo_tipo,
            n_selecciones: suyas.length,
            primer_evento: suyas[0]?.evento ?? null,
          })
        }
      }
    }
  } catch (e) {
    registrarError('deportes:revisar', e)
    fallo = 'No se ha podido cargar la revisión. Recarga la página en unos segundos.'
  }
  if (fallo) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
        {fallo}
      </p>
    )
  }

  return (
    <>
      <p className="text-sm font-semibold" data-contador-revisar>
        {grupos.length === 0 ? 'No hay posibles errores.' : grupos.length === 1 ? '1 posible error' : `${grupos.length} posibles errores`}
      </p>
      <ul className="space-y-4">
        {grupos.map((g) => (
          <li key={g.clave} className="space-y-3 rounded-2xl border border-amber-500/40 bg-surface p-3" data-grupo={g.partido}>
            <div>
              <p className="break-words text-base font-semibold">{g.partido}</p>
              <p className="text-sm text-muted" data-fecha-grupo>
                Fecha del partido: <strong>{fechaLarga(g.fecha)}</strong> ({g.fecha})
              </p>
            </div>
            <ul className="space-y-1 text-sm">
              {g.ligas.map((l) => (
                <li key={`${l.deporte}|${l.liga}`} className="flex justify-between gap-2">
                  <span className={l.liga === SIN_LIGA ? 'italic text-muted' : 'font-medium'}>
                    {l.liga} <span className="text-xs text-muted">· {l.deporte}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {l.selecciones} {l.selecciones === 1 ? 'selección' : 'selecciones'}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {g.apuestas.map((id) => {
                const a = apuestas.get(id)
                if (!a) return null
                return (
                  <li key={id} className="space-y-1">
                    <TarjetaApuesta a={a} volver={VOLVER} />
                    <p className="px-1 text-xs text-muted" data-ligas-apuesta>
                      En este partido ({g.fecha}): <strong>{g.porApuesta[id]?.join(' / ')}</strong>
                    </p>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  )
}
