import Link from 'next/link'
import { contarPorResolver } from '@/lib/server/datos'

// Chip "Por resolver": apuestas guardadas en estado PENDIENTE (falta marcar el resultado). Lleva a
// la lista filtrada por pendientes. Con 0 no se enseña. Distinto de "Tienes N sin revisar" (capturas
// leídas por la IA que aún no se han guardado).
export async function ChipPorResolver() {
  const n = await contarPorResolver().catch(() => 0)
  if (n <= 0) return null
  return (
    <Link
      href="/apuestas?estado=pendiente"
      aria-label={`${n} ${n === 1 ? 'apuesta' : 'apuestas'} por resolver: ver y marcar el resultado`}
      data-por-resolver={n}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/60 bg-amber-500/10 pl-3 pr-2 text-sm font-semibold text-amber-800 dark:text-amber-300"
    >
      Por resolver
      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
        {n > 99 ? '99+' : n}
      </span>
    </Link>
  )
}
