'use client'

import { useRouter } from 'next/navigation'
import { ESTADOS_APUESTA, NOMBRE_ESTADO } from '@/lib/apuestas/estados'
import type { Opcion } from '@/lib/apuestas/formulario'
import { emojiDeporte } from '@/lib/apuestas/emojis'

// Filtros básicos de la lista: por estado y por casa (se guardan en la dirección).
export function FiltrosApuestas({
  estado,
  casa,
  deporte,
  casas,
  deportes,
  directo,
  precipitada,
}: {
  estado: string
  casa: string
  deporte: string
  directo: boolean
  precipitada: boolean
  casas: Opcion[]
  deportes: string[]
}) {
  const router = useRouter()

  function ir(
    nuevoEstado: string,
    nuevaCasa: string,
    nuevoDeporte = deporte,
    nuevoDirecto = directo,
    nuevaPrecipitada = precipitada,
  ) {
    const q = new URLSearchParams()
    if (nuevoDirecto) q.set('directo', '1')
    if (nuevaPrecipitada) q.set('precipitada', '1')
    if (nuevoEstado) q.set('estado', nuevoEstado)
    if (nuevaCasa) q.set('casa', nuevaCasa)
    if (nuevoDeporte) q.set('deporte', nuevoDeporte)
    const s = q.toString()
    router.replace(s ? `/apuestas?${s}` : '/apuestas', { scroll: false })
  }

  const clase = 'h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm'
  return (
    <div className="grid grid-cols-2 gap-2">
      <select aria-label="Filtrar por estado" value={estado} onChange={(e) => ir(e.target.value, casa)} className={clase}>
        <option value="">Todos los estados</option>
        {ESTADOS_APUESTA.map((e) => (
          <option key={e} value={e}>
            {NOMBRE_ESTADO[e]}
          </option>
        ))}
      </select>
      <select aria-label="Filtrar por casa" value={casa} onChange={(e) => ir(estado, e.target.value)} className={clase}>
        <option value="">Todas las casas</option>
        {casas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
        <option value="sin">Sin casa</option>
      </select>
      <select
        aria-label="Filtrar por deporte"
        value={deporte}
        onChange={(e) => ir(estado, casa, e.target.value)}
        className={`${clase} col-span-2`}
      >
        <option value="">Todos los deportes</option>
        {deporte && !deportes.includes(deporte) && <option value={deporte}>{deporte}</option>}
        {deportes.map((d) => (
          <option key={d} value={d} aria-label={d}>
            {emojiDeporte(d)} {d}
          </option>
        ))}
      </select>
      <Chip etiqueta="En directo" activo={directo} onClick={() => ir(estado, casa, deporte, !directo, precipitada)} />
      <Chip etiqueta="Precipitadas" activo={precipitada} onClick={() => ir(estado, casa, deporte, directo, !precipitada)} />
    </div>
  )
}

function Chip({ etiqueta, activo, onClick }: { etiqueta: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`h-11 min-w-0 rounded-xl border px-3 text-sm font-medium ${
        activo ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'
      }`}
    >
      {activo ? '✓ ' : ''}
      {etiqueta}
    </button>
  )
}
