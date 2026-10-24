import Image from 'next/image'
import Link from 'next/link'
import type { UsuarioActual } from '@/lib/auth'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'

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
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <Link href="/" className="mb-6 block px-3" aria-label="Ir al inicio">
          <Logo className="h-9 w-auto" />
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/" className="md:hidden" aria-label="Ir al inicio">
              <Logo className="h-7 w-auto" />
            </Link>
          </div>
          <UserMenu nombre={usuario.nombre} email={usuario.email} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
