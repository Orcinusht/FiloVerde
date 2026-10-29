import { CompletarAcceso } from './completar-acceso'

export const metadata = { title: 'Entrando · Filoverde' }

// Aquí vuelve el usuario tras entrar con Google o tras pulsar el enlace del
// email de confirmación. Lo que trae el enlace se lee en el navegador (la
// parte tras "#" no llega al servidor) y se convierte en sesión en el servidor.
export default function Page() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <p className="text-muted">Entrando…</p>
      <CompletarAcceso />
    </main>
  )
}
