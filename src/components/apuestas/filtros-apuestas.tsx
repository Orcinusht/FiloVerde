'use client'

import { useRouter } from 'next/navigation'
import { ESTADOS_APUESTA, NOMBRE_ESTADO } from '@/lib/apuestas/estados'
import type { Opcion } from '@/lib/apuestas/formulario'

// Filtros básicos de la lista: por estado y por casa (se guardan en la dirección).
export function FiltrosApuestas({
  estado,
  casa,
  deporte,
  casas,
  deportes,
}: {
  estado: string
  casa: string
  deporte: string
  casas: Opcion[]
  deportes: string[]
}) {
  const router = useRouter()

  function ir(nuevoEstado: string, nuevaCasa: string, nuevoDeporte = deporte) {
    const q = new URLSearchParams()
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
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  )
}
