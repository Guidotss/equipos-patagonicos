import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar · Equipos Patagónicos' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold tracking-tight text-primary">Equipos Patagónicos</p>
          <p className="text-sm text-muted-foreground">Administración y logística</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  )
}
