'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Modo claro/oscuro. Por defecto sigue al sistema; se puede fijar en Ajustes.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
