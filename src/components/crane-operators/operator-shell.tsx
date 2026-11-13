import Image from 'next/image'
import Link from 'next/link'
import { UserMenu } from '@/components/app-shell/user-menu'
import type { UserCurrent } from '@/lib/auth'

export function OperatorShell({
  user,
  children,
}: {
  user: UserCurrent
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/operator" aria-label="Mis remitos">
            <Image
              src="/logo-equipos-patagonicos.png"
              alt="Equipos Patagónicos"
              width={437}
              height={95}
              preload
              className="h-8 w-auto sm:h-10"
            />
          </Link>
          <UserMenu nombre={user.nombre} email={user.email} />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 pb-12 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
