import type { Metadata } from 'next'
import Image from 'next/image'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-svh flex-col bg-background lg:flex-row">
      {/* Panel de marca: en celular es una franja arriba del formulario (docs/diseno/referencias/08-login.png). */}
      <section className="relative flex flex-col justify-between gap-8 overflow-hidden bg-linear-to-br from-portada-desde to-portada-hasta px-6 py-6 text-white lg:w-1/2 lg:px-14 lg:py-7">
        <div aria-hidden className="absolute inset-0 bg-[url(/portada-ganchos.svg)] bg-size-[180px_175px] opacity-70" />
        <div className="relative w-fit rounded-xl bg-white px-3.5 py-3 shadow-lg shadow-black/10 lg:-ml-8 lg:py-4">
          <Image
            src="/logo-equipos-patagonicos.png"
            alt="Equipos Patagónicos"
            width={437}
            height={95}
            preload
            className="h-9 w-auto lg:h-10"
          />
        </div>
        <div className="relative max-w-xl space-y-3">
          <p className="text-4xl leading-[1.1] font-bold tracking-tight lg:max-w-[31rem] lg:text-[4.25rem]">Administración y logística</p>
          <p className="text-lg text-white/80 lg:text-2xl">Cotizaciones, presupuestos y cobranzas de Equipos Patagónicos.</p>
        </div>
        <p className="relative hidden text-white/80 lg:block">Neuquén · Argentina</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
        <div className="w-full max-w-[380px] space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight lg:text-[2.5rem]">Ingresar</h1>
            <p className="text-lg text-muted-foreground">Usá tu email y contraseña de la empresa.</p>
          </div>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  )
}
