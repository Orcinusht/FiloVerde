export function ComingSoon({ text }: { text: string }) {
  return (
    <div className="mx-4 mt-4 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="text-lg font-semibold">Próximamente</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  )
}
