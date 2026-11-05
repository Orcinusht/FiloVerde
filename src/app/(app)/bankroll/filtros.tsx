'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Desplegable que guarda su valor en la dirección (y vuelve a la primera página).
export function FiltroDireccion({ nombre, etiqueta, valor, opciones }: { nombre: string; etiqueta: string; valor: string; opciones: [string, string][] }) {
  const router = useRouter()
  const ruta = usePathname()
  const sp = useSearchParams()
  return (
    <select
      aria-label={etiqueta}
      value={valor}
      onChange={(e) => {
        const q = new URLSearchParams(sp.toString())
        if (e.target.value) q.set(nombre, e.target.value)
        else q.delete(nombre)
        q.delete('pagina')
        const s = q.toString()
        router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false })
      }}
      className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm"
    >
      {opciones.map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  )
}
