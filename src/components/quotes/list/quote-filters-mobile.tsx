import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { type FiltersList } from '@/lib/quotes/list'
import { SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'

import { DateRangeFields, OptionsClient, OptionsStatus, DateRangeWarning } from './quote-filter-fields'
import { readFilterStatus, isInvalidDateRange, type ClientFilter, type MobileQuoteFilters } from './quote-filter-model'

const LABEL_CLASS = 'text-[13px]/none font-normal text-muted-foreground'

/** En pantallas angostas: un botón "Filtros" que abre una hoja desde abajo con estado, cliente y fechas. */
export function FiltersMobile({
  filters,
  clients,
  active,
  onApply,
}: {
  filters: FiltersList
  clients: ClientFilter[]
  active: number
  onApply: (changes: MobileQuoteFilters) => void
}) {
  const idStatus = useId()
  const idClient = useId()
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<MobileQuoteFilters>({
    estado: filters.estado,
    cliente: filters.cliente,
    desde: filters.desde,
    hasta: filters.hasta,
  })
  const dateRange = { from: sheet.desde, to: sheet.hasta }

  function onOpenChange(open: boolean) {
    if (open)
      setSheet({ estado: filters.estado, cliente: filters.cliente, desde: filters.desde, hasta: filters.hasta })
    setOpen(open)
  }

  function apply(changes: MobileQuoteFilters) {
    setOpen(false)
    onApply(changes)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-1.5 px-3 text-sm @min-[44rem]/listado:hidden">
          <SlidersHorizontal aria-hidden />
          Filtros
          {active > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {active}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Estado, cliente y fechas de la cotización.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="space-y-1">
            <Label htmlFor={idStatus} className={LABEL_CLASS}>
              Estado
            </Label>
            <NativeSelect
              id={idStatus}
              value={sheet.estado}
              onChange={(event) => setSheet({ ...sheet, estado: readFilterStatus(event.target.value) })}
              className="w-full [&>select]:h-10"
            >
              <OptionsStatus />
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={idClient} className={LABEL_CLASS}>
              Cliente
            </Label>
            <NativeSelect
              id={idClient}
              value={sheet.cliente}
              onChange={(event) => setSheet({ ...sheet, cliente: event.target.value })}
              className="w-full [&>select]:h-10"
            >
              <OptionsClient clients={clients} />
            </NativeSelect>
          </div>
          <DateRangeFields
            range={dateRange}
            onChange={({ from, to }) => setSheet({ ...sheet, desde: from, hasta: to })}
            tall="h-10"
          />
          {isInvalidDateRange(dateRange) ? <DateRangeWarning /> : null}
        </div>
        <SheetFooter className="flex-row border-t">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            onClick={() => apply({ estado: '', cliente: '', desde: '', hasta: '' })}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            className="h-10 flex-1"
            disabled={isInvalidDateRange(dateRange)}
            onClick={() => apply(sheet)}
          >
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
