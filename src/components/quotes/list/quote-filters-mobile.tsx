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

import { FieldsRango, OptionsClient, OptionsStatus, WarningRango } from './quote-filter-fields'
import { readFilterStatus, isInvalidDateRange, type ClientFilter, type MobileQuoteFilters } from './quote-filter-model'

const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'

/** En pantallas angostas: un botón "Filtros" que abre una hoja desde abajo con estado, cliente y fechas. */
export function FiltersMobile({
  filters,
  clientes,
  activos,
  onApply,
}: {
  filters: FiltersList
  clientes: ClientFilter[]
  activos: number
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

  function onAbrir(abrir: boolean) {
    if (abrir)
      setSheet({ estado: filters.estado, cliente: filters.cliente, desde: filters.desde, hasta: filters.hasta })
    setOpen(abrir)
  }

  function apply(changes: MobileQuoteFilters) {
    setOpen(false)
    onApply(changes)
  }

  return (
    <Sheet open={open} onOpenChange={onAbrir}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-1.5 px-3 text-sm @min-[44rem]/listado:hidden">
          <SlidersHorizontal aria-hidden />
          Filtros
          {activos > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {activos}
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
            <Label htmlFor={idStatus} className={ETIQUETA}>
              Estado
            </Label>
            <NativeSelect
              id={idStatus}
              value={sheet.estado}
              onChange={(evento) => setSheet({ ...sheet, estado: readFilterStatus(evento.target.value) })}
              className="w-full [&>select]:h-10"
            >
              <OptionsStatus />
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={idClient} className={ETIQUETA}>
              Cliente
            </Label>
            <NativeSelect
              id={idClient}
              value={sheet.cliente}
              onChange={(evento) => setSheet({ ...sheet, cliente: evento.target.value })}
              className="w-full [&>select]:h-10"
            >
              <OptionsClient clientes={clientes} />
            </NativeSelect>
          </div>
          <FieldsRango rango={sheet} onChange={(rango) => setSheet({ ...sheet, ...rango })} alto="h-10" />
          {isInvalidDateRange(sheet) ? <WarningRango /> : null}
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
            disabled={isInvalidDateRange(sheet)}
            onClick={() => apply(sheet)}
          >
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
