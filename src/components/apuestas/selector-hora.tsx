'use client'

import { useIdCampo } from './id-campo'

// Hora con DOS desplegables (hora 00-23 y minuto de 5 en 5). Sustituye al control nativo, porque
// Safari de iPhone ignora el paso de 5 minutos. Un minuto que no sea múltiplo de 5 (p. ej. 14:32,
// leído por la IA o guardado antes) se muestra como una opción más y NUNCA se redondea solo.
// Valor: "HH:MM" o '' (sin hora).

const dos = (n: number) => String(n).padStart(2, '0')
const HORAS = Array.from({ length: 24 }, (_, i) => dos(i))
const MINUTOS = Array.from({ length: 12 }, (_, i) => dos(i * 5))

export function SelectorHora({
  valor,
  onCambio,
  marcado,
  conError,
  etiquetaMinuto = 'Minuto',
}: {
  valor: string
  onCambio: (v: string) => void
  marcado?: boolean
  conError?: boolean
  etiquetaMinuto?: string
}) {
  const { id, descripcion } = useIdCampo()
  const r = /^(\d{1,2}):(\d{2})/.exec(valor.trim())
  const hora = r ? dos(Number(r[1])) : ''
  const minuto = r ? r[2] : ''
  const minutos = minuto && !MINUTOS.includes(minuto) ? [...MINUTOS, minuto].sort() : MINUTOS
  const clase = `h-12 w-full min-w-0 rounded-xl border px-3 text-base outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 ${
    conError ? 'border-red-500 bg-red-500/5' : marcado ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-background'
  }`
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <select
        id={id}
        aria-describedby={descripcion}
        aria-invalid={conError || undefined}
        value={hora}
        onChange={(e) => onCambio(e.target.value ? `${e.target.value}:${minuto || '00'}` : '')}
        className={clase}
      >
        <option value="">— h</option>
        {HORAS.map((h) => (
          <option key={h} value={h}>
            {h} h
          </option>
        ))}
      </select>
      <select
        aria-label={etiquetaMinuto}
        aria-describedby={descripcion}
        value={minuto}
        disabled={!hora}
        onChange={(e) => hora && onCambio(`${hora}:${e.target.value}`)}
        className={clase}
      >
        {!hora && <option value="">— min</option>}
        {minutos.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
    </div>
  )
}
