import { cloneElement, isValidElement } from 'react'
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
  const descripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined
  const control = isValidElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children)
    ? cloneElement(children, {
        'aria-describedby': [...new Set([children.props['aria-describedby'], descripcion].filter(Boolean))].join(' ') || undefined,
        ...(error ? { 'aria-invalid': true } : {}),
      })
    : children

  return (
    <div className={cn('space-y-1.5 md:space-y-1', className)}>
      <Label htmlFor={id} className="text-[13px]/none font-normal text-muted-foreground">
        {etiqueta}
      </Label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  )
}
