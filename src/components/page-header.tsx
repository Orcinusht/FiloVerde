export function PageHeader({ title }: { title: string }) {
  return (
    <header className="pt-[env(safe-area-inset-top)]">
      <h1 className="px-4 pb-2 pt-6 text-2xl font-bold tracking-tight">{title}</h1>
    </header>
  )
}
