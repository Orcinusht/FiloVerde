import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { ThemeSelector } from './theme-selector'
import { AccountSection } from './account-section'
import { CosteIA } from './coste-ia'
import { CapturasGuardadas } from './capturas-guardadas'

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
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Catálogo</h2>
          <Link
            href="/ajustes/deportes"
            className="flex h-12 items-center justify-between rounded-xl border border-border bg-surface px-4 text-sm font-medium"
          >
            Deportes y ligas <span aria-hidden="true">→</span>
          </Link>
        </section>
        <AccountSection />
      </div>
    </>
  )
}
