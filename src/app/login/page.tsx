import { Suspense } from 'react'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar · Filoverde' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl font-bold text-brand-foreground">
          F
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Filoverde</h1>
        <p className="mt-1 text-sm text-muted">Registra y analiza tus apuestas.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
