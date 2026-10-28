import { BottomNav } from '@/components/bottom-nav'

// Marco común de las pantallas con sesión: contenido + barra inferior.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <main className="mx-auto max-w-md pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </>
  )
}
