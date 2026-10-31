import { cloneElement, isValidElement } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Field({
  id,
  label,
  error,
  help,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  help?: string
  className?: string
  children: React.ReactNode
}) {
  const descripcion = error ? `${id}-error` : help ? `${id}-ayuda` : undefined
  const control = isValidElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children)
    ? cloneElement(children, {
        'aria-describedby': [...new Set([children.props['aria-describedby'], descripcion].filter(Boolean))].join(' ') || undefined,
        ...(error ? { 'aria-invalid': true } : {}),
      })
    : children

  return (
    <div className={cn('space-y-1.5 md:space-y-1', className)}>
      <Label htmlFor={id} className="text-[13px]/none font-normal text-muted-foreground">
        {label}
      </Label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  )
}
