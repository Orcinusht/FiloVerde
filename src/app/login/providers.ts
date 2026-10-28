import type { Provider } from '@supabase/supabase-js'

// Proveedores de inicio de sesión que aparecen como botón.
// Para añadir Apple más adelante: actívalo en Supabase y descomenta su línea.
export const PROVEEDORES: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Continuar con Google' },
  // { id: 'apple', label: 'Continuar con Apple' },
]
