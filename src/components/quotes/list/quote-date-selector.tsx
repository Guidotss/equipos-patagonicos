import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { todayArgentina } from '@/lib/format/dates'
import { atajosDates, textRangoDates, type AtajoDates } from '@/lib/quotes/list-view'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'

import { FieldsRango, WarningRango } from './quote-filter-fields'
import { isInvalidDateRange, type DateRange } from './quote-filter-model'

/** Botón con el rango que abre un popover con Desde, Hasta y atajos. Sin rango por defecto (decisión 23). */
export function SelectorDates({
  desde,
  hasta,
  onApply,
  className,
}: {
  desde: string
  hasta: string
  onApply: (rango: DateRange) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rango, setRango] = useState<DateRange>({ desde, hasta })
  const [atajos, setAtajos] = useState<AtajoDates[]>([])
  const texto = textRangoDates(desde, hasta)

  function onAbrir(abrir: boolean) {
    if (abrir) {
      setRango({ desde, hasta })
      // Se calculan al abrir y no al dibujar: "hoy" no puede cambiar entre el servidor y el navegador.
      setAtajos(atajosDates(todayArgentina()))
    }
    setOpen(abrir)
  }

  function apply(nuevo: DateRange) {
    setOpen(false)
    onApply(nuevo)
  }

  return (
    <Popover open={open} onOpenChange={onAbrir}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Fechas: ${texto}`}
          className={cn('h-10 w-full justify-between bg-background px-3 font-normal', className)}
        >
          <span className={cn('truncate tabular-nums', !desde && !hasta && 'text-muted-foreground')}>{texto}</span>
          <CalendarDays className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Rango de fechas" className="w-80 gap-3 p-3">
        <FieldsRango rango={rango} onChange={setRango} alto="h-10" />
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((atajo) => (
            <Button
              key={atajo.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => apply({ desde: atajo.desde, hasta: atajo.hasta })}
            >
              {atajo.label}
            </Button>
          ))}
        </div>
        {isInvalidDateRange(rango) ? <WarningRango /> : null}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply({ desde: '', hasta: '' })}>
            Limpiar
          </Button>
          <Button type="button" size="sm" disabled={isInvalidDateRange(rango)} onClick={() => apply(rango)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
