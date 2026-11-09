import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { ThemeSelector } from './theme-selector'
import { AccountSection } from './account-section'
import { CosteIA } from './coste-ia'
import { CapturasGuardadas } from './capturas-guardadas'
import { CopiaSeguridad } from './copia-seguridad'
import { ApiFutbol } from './api-futbol'

export const metadata = { title: 'Ajustes · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-6 px-4 pt-2">
        <ThemeSelector />
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-surface" />}>
          <CosteIA />
        </Suspense>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
          <CapturasGuardadas />
        </Suspense>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
          <ApiFutbol />
        </Suspense>
        <CopiaSeguridad />
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Catálogo</h2>
          <div className="space-y-2">
            {[
              ['/ajustes/casas', 'Casas de apuestas'],
              ['/ajustes/estrategias', 'Estrategias'],
              ['/ajustes/deportes', 'Deportes y ligas'],
            ].map(([href, texto]) => (
              <Link
                key={href}
                href={href}
                className="flex h-12 items-center justify-between rounded-xl border border-border bg-surface px-4 text-sm font-medium"
              >
                {texto} <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
        <AccountSection />
      </div>
    </>
  )
}
