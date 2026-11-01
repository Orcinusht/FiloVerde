import Link from 'next/link'

export default function NoEncontrada() {
  return (
    <div className="mx-4 mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="text-lg font-semibold">Esta apuesta no existe</p>
      <p className="mt-1 text-sm text-muted">Puede que la hayas borrado.</p>
      <Link href="/apuestas" className="mt-4 inline-flex h-11 items-center font-semibold text-brand">
        Volver a la lista
      </Link>
    </div>
  )
}
