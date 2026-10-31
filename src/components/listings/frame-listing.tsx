import { cn } from '@/lib/utils'

export function FrameListing({ tools, pie: footer, children, className }: {
  tools: React.ReactNode
  pie?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('@container/listado min-w-0 rounded-xl border bg-card', className)}>
      <div className="border-b p-4">{tools}</div>
      <div className="min-w-0">{children}</div>
      {footer}
    </div>
  )
}
