import type { UsuarioActual } from '@/lib/auth'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { UserMenu } from './user-menu'

export function AppShell({ usuario, children }: { usuario: UsuarioActual; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <p className="mb-6 px-3 text-lg font-bold tracking-tight text-primary">Equipos Patagónicos</p>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="font-semibold text-primary md:hidden">Equipos Patagónicos</span>
          </div>
          <UserMenu nombre={usuario.nombre} email={usuario.email} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
