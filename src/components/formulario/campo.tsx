import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  id: string
  etiqueta: string
  error?: string
  ayuda?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className="text-[13px] font-normal text-muted-foreground">
        {etiqueta}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  )
}
