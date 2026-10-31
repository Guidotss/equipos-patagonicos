import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { todayArgentina } from '@/lib/format/dates'
import { dateShortcuts, formatDateRange, type DateShortcut } from '@/lib/quotes/list-view'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'

import { DateRangeFields, DateRangeWarning } from './quote-filter-fields'
import { isInvalidDateRange, type DateRange } from './quote-filter-model'

/** Botón con el rango que abre un popover con Desde, Hasta y atajos. Sin rango por defecto (decisión 23). */
export function SelectorDates({
  from,
  to,
  onApply,
  className,
}: {
  from: string
  to: string
  onApply: (range: DateRange) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange>({ from, to })
  const [shortcuts, setShortcuts] = useState<DateShortcut[]>([])
  const text = formatDateRange(from, to)

  function onOpenChange(open: boolean) {
    if (open) {
      setRange({ from, to })
      // Se calculan al abrir y no al dibujar: "hoy" no puede cambiar entre el servidor y el navegador.
      setShortcuts(dateShortcuts(todayArgentina()))
    }
    setOpen(open)
  }

  function apply(next: DateRange) {
    setOpen(false)
    onApply(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Fechas: ${text}`}
          className={cn('h-10 w-full justify-between bg-background px-3 font-normal', className)}
        >
          <span className={cn('truncate tabular-nums', !from && !to && 'text-muted-foreground')}>{text}</span>
          <CalendarDays className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Rango de fechas" className="w-80 gap-3 p-3">
        <DateRangeFields range={range} onChange={setRange} tall="h-10" />
        <div className="flex flex-wrap gap-1.5">
          {shortcuts.map((shortcut) => (
            <Button
              key={shortcut.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => apply({ from: shortcut.desde, to: shortcut.hasta })}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
        {isInvalidDateRange(range) ? <DateRangeWarning /> : null}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply({ from: '', to: '' })}>
            Limpiar
          </Button>
          <Button type="button" size="sm" disabled={isInvalidDateRange(range)} onClick={() => apply(range)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
