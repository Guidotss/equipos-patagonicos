'use client'

import { LoaderCircle, type LucideIcon } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, estaActive } from './nav-items'

function ContentEnlace({ label, icon: Icon, activo }: { label: string; icon: LucideIcon; activo: boolean }) {
  const { pending } = useLinkStatus()
  return (
    <>
      <Icon className={cn('size-[18px] shrink-0', activo ? null : 'text-slate-500')} aria-hidden />
      <span className="min-w-0 flex-1">{label}</span>
      {pending ? (
        <span role="status" aria-label={`Abriendo ${label}`}>
          <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
        </span>
      ) : null}
    </>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const activo = estaActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors',
              activo
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
            )}
          >
            <ContentEnlace label={label} icon={Icon} activo={activo} />
          </Link>
        )
      })}
    </nav>
  )
}
