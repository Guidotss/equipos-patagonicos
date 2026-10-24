import type { Metadata } from 'next'
import Image from 'next/image'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src="/logo-equipos-patagonicos.png"
            alt="Equipos Patagónicos"
            width={437}
            height={95}
            priority
            className="h-12 w-auto"
          />
          <p className="text-sm text-muted-foreground">Administración y logística</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  )
}
