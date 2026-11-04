'use client'

import { useEffect, useState } from 'react'
import { buscarDuplicadas } from '@/app/(app)/apuestas/actions'
import { ajustarPorTipo, type Opcion } from '@/lib/apuestas/formulario'
import type { Revision } from '@/lib/apuestas/propuesta'
import { NOMBRE_ESTADO, NOMBRE_TIPO, esEstadoApuesta, esTipoApuesta } from '@/lib/apuestas/estados'
import { marcadasPorDefecto } from '@/lib/apuestas/cola'
import { normalizar } from '@/lib/apuestas/catalogo'
import { VisorCaptura } from './visor-captura'

// Captura con 2 o más apuestas válidas: "¿Cuáles quieres guardar?". Marcadas por defecto las que
// no están ya registradas (misma comparación que el aviso de duplicadas, con tu sesión).
export function EleccionApuestas({
  ruta,
  opciones,
  ignoradas,
  casas,
  onElegir,
}: {
  ruta: string | null
  opciones: { indice: number; revision: Revision }[]
  ignoradas: number
  casas: Opcion[]
  onElegir: (marcadas: number[]) => void
}) {
  const [yaRegistradas, setYaRegistradas] = useState<Set<number> | null>(null)
  const [marcadas, setMarcadas] = useState<number[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const duplicadas = new Set<number>()
      for (const o of opciones) {
        const v = { ...o.revision.valores }
        const detectada = o.revision.casaDetectada
        const casa = detectada ? casas.find((c) => normalizar(c.nombre) === normalizar(detectada)) : undefined
        if (!v.casa_id && casa) v.casa_id = casa.id
        const r = await buscarDuplicadas({ valores: ajustarPorTipo(v), casaPendiente: !!detectada && !casa }).catch(() => null)
        if (r && r.ok && r.total > 0) duplicadas.add(o.indice)
      }
      if (!vivo) return
      setYaRegistradas(duplicadas)
      setMarcadas(marcadasPorDefecto(opciones.map((o) => ({ indice: o.indice, yaRegistrada: duplicadas.has(o.indice) }))))
    })()
    return () => {
      vivo = false
    }
  }, [opciones, casas])

  const alternar = (i: number) => setMarcadas((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i].sort((a, b) => a - b)))

  return (
    <div className="space-y-3 px-4">
      {ruta && <VisorCaptura ruta={ruta} />}
      <h2 className="text-base font-semibold">
        He encontrado {opciones.length} apuestas en esta captura. ¿Cuáles quieres guardar?
      </h2>
      {yaRegistradas === null ? (
        <p className="text-sm text-muted" aria-live="polite">
          Comprobando si ya las tienes registradas…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMarcadas(opciones.map((o) => o.indice))} className="h-11 rounded-xl border border-border text-sm font-semibold">
              Seleccionar todas
            </button>
            <button type="button" onClick={() => setMarcadas([])} className="h-11 rounded-xl border border-border text-sm font-semibold">
              Ninguna
            </button>
          </div>
          <ul className="space-y-2" aria-label="Apuestas de la captura">
            {opciones.map((o) => {
              const v = o.revision.valores
              const sel = v.selecciones[0]
              const principal = [sel?.pronostico, sel?.mercado].filter(Boolean).join(' · ') || sel?.evento || 'Sin selección'
              const marcada = marcadas.includes(o.indice)
              const registrada = yaRegistradas.has(o.indice)
              return (
                <li key={o.indice}>
                  <label
                    className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${marcada ? 'border-brand bg-brand/10' : 'border-border bg-surface'}`}
                  >
                    <input type="checkbox" checked={marcada} onChange={() => alternar(o.indice)} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold break-words">{principal}</span>
                      <span className="block text-muted">
                        {[
                          o.revision.casaDetectada ?? 'Sin casa',
                          esTipoApuesta(v.tipo) ? NOMBRE_TIPO[v.tipo] : null,
                          v.importe ? `${v.importe} €` : null,
                          esEstadoApuesta(v.estado) && v.estado !== 'pendiente' ? NOMBRE_ESTADO[v.estado] : null,
                          v.estado !== 'pendiente' && v.resultado_economico ? `${v.resultado_economico} €` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {registrada && (
                        <span className="mt-1 inline-block rounded bg-amber-500/20 px-1.5 py-px text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Ya registrada
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {ignoradas > 0 && (
        <p className="text-sm text-muted">
          He ignorado {ignoradas} {ignoradas === 1 ? 'apuesta cortada o sin selección' : 'apuestas cortadas o sin selección'}.
        </p>
      )}
      <button
        type="button"
        disabled={yaRegistradas === null || enviando}
        onClick={() => {
          setEnviando(true)
          onElegir(marcadas)
        }}
        className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground disabled:opacity-60"
      >
        {marcadas.length === 0 ? 'No guardar ninguna' : marcadas.length === 1 ? 'Revisar 1 apuesta' : `Revisar ${marcadas.length} apuestas`}
      </button>
    </div>
  )
}
