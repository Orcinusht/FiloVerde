'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'

const OPCIONES = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
] as const

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  // El tema elegido solo se conoce en el navegador; evitamos un parpadeo incorrecto.
  const montado = useSyncExternalStore(
    () => () => {},
    () => true, // en el navegador
    () => false, // en el servidor
  )

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Apariencia</h2>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 border border-border">
        {OPCIONES.map(({ value, label }) => {
          const activo = montado && theme === value
          return (
            <button
              key={value}
              role="radio"
              aria-checked={activo}
              onClick={() => setTheme(value)}
              className={`h-11 rounded-lg text-sm font-medium transition-colors ${
                activo ? 'bg-brand text-brand-foreground' : 'text-muted'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
