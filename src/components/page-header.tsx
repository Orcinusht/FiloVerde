import type { ReactNode } from 'react'

export function PageHeader({ title, accion }: { title: string; accion?: ReactNode }) {
  return (
    <header className="pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {accion}
      </div>
    </header>
  )
}
