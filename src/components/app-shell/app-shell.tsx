import Image from 'next/image'
import Link from 'next/link'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { UsuarioActual } from '@/lib/auth'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'
import { BuscadorGlobal } from './buscador-global'

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-equipos-patagonicos.png"
      alt="Equipos Patagónicos"
      width={437}
      height={95}
      preload
      className={className}
    />
  )
}

export function AppShell({ usuario, children }: { usuario: UsuarioActual; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-svh">
        <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <Link href="/" className="block px-5 pt-6 pb-10" aria-label="Ir al inicio">
            <Logo className="h-[42px] w-auto" />
          </Link>
          <div className="px-3 pb-4"><BuscadorGlobal /></div>
          <div className="flex-1 overflow-y-auto px-3 py-1">
            <SidebarNav />
          </div>
          <div className="border-t border-sidebar-border p-3">
            <UserMenu nombre={usuario.nombre} email={usuario.email} lateral />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background px-3 md:hidden">
            <div className="flex items-center gap-1">
              <MobileNav logo={<Logo className="h-9 w-auto" />} />
              <Link href="/" aria-label="Ir al inicio">
                <Logo className="h-7 w-auto" />
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <BuscadorGlobal compacto />
              <UserMenu nombre={usuario.nombre} email={usuario.email} />
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
