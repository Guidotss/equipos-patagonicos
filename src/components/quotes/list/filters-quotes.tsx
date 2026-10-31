'use client'

import { CalendarDays, Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react'
import { STATUSES_QUOTE } from '@/components/quotes/status-quote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { STATUSES_FILTER, hrefWithFilters, readFilters, type FiltersList } from '@/lib/quotes/list'
import { atajosDates, textRangoDates, type AtajoDates } from '@/lib/quotes/list-view'
import { todayArgentina } from '@/lib/format/dates'
import { cn } from '@/lib/utils'

type ClientFilter = { id: string; razon_social: string }
type Rango = { desde: string; hasta: string }
type FiltersSheet = Pick<FiltersList, 'estado' | 'cliente' | 'desde' | 'hasta'>

const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'

function aStatus(value: string): FiltersList['estado'] {
  return STATUSES_FILTER.find((estado) => estado === value) ?? ''
}

function rangoInvalid({ desde, hasta }: Rango) {
  return desde !== '' && hasta !== '' && desde > hasta
}

function WarningRango() {
  return <p className="text-sm text-destructive">“Hasta” es anterior a “Desde”.</p>
}

function OptionsStatus() {
  return (
    <>
      <NativeSelectOption value="">Todos los estados</NativeSelectOption>
      {STATUSES_FILTER.map((estado) => (
        <NativeSelectOption key={estado} value={estado}>
          {STATUSES_QUOTE[estado].label}
        </NativeSelectOption>
      ))}
    </>
  )
}

function OptionsClient({ clientes }: { clientes: ClientFilter[] }) {
  return (
    <>
      <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
      {clientes.map((cliente) => (
        <NativeSelectOption key={cliente.id} value={cliente.id}>
          {cliente.razon_social}
        </NativeSelectOption>
      ))}
    </>
  )
}

/** Desde y Hasta como date nativos (sin calendario: no suma dependencias). */
function FieldsRango({ rango, onChange, alto }: { rango: Rango; onChange: (rango: Rango) => void; alto: string }) {
  const idFrom = useId()
  const idTo = useId()
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={idFrom} className={ETIQUETA}>
          Desde
        </Label>
        <Input
          id={idFrom}
          type="date"
          value={rango.desde}
          max={rango.hasta || undefined}
          onChange={(evento) => onChange({ ...rango, desde: evento.target.value })}
          className={alto}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={idTo} className={ETIQUETA}>
          Hasta
        </Label>
        <Input
          id={idTo}
          type="date"
          value={rango.hasta}
          min={rango.desde || undefined}
          onChange={(evento) => onChange({ ...rango, hasta: evento.target.value })}
          className={alto}
        />
      </div>
    </div>
  )
}

/** Botón con el rango que abre un popover con Desde, Hasta y atajos. Sin rango por defecto (decisión 23). */
function SelectorDates({
  desde,
  hasta,
  onApply,
  className,
}: {
  desde: string
  hasta: string
  onApply: (rango: Rango) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rango, setRango] = useState<Rango>({ desde, hasta })
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

  function apply(nuevo: Rango) {
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
        {rangoInvalid(rango) ? <WarningRango /> : null}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply({ desde: '', hasta: '' })}>
            Limpiar
          </Button>
          <Button type="button" size="sm" disabled={rangoInvalid(rango)} onClick={() => apply(rango)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** En pantallas angostas: un botón "Filtros" que abre una hoja desde abajo con estado, cliente y fechas. */
function FiltersMobile({
  filters,
  clientes,
  activos,
  onApply,
}: {
  filters: FiltersList
  clientes: ClientFilter[]
  activos: number
  onApply: (changes: FiltersSheet) => void
}) {
  const idStatus = useId()
  const idClient = useId()
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<FiltersSheet>({
    estado: filters.estado,
    cliente: filters.cliente,
    desde: filters.desde,
    hasta: filters.hasta,
  })

  function onAbrir(abrir: boolean) {
    if (abrir) setSheet({ estado: filters.estado, cliente: filters.cliente, desde: filters.desde, hasta: filters.hasta })
    setOpen(abrir)
  }

  function apply(changes: FiltersSheet) {
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
              onChange={(evento) => setSheet({ ...sheet, estado: aStatus(evento.target.value) })}
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
          {rangoInvalid(sheet) ? <WarningRango /> : null}
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
          <Button type="button" className="h-10 flex-1" disabled={rangoInvalid(sheet)} onClick={() => apply(sheet)}>
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Buscador y filtros de la lista. Todo vive en la URL (hrefConFiltros): los selects y las fechas navegan solos y el
 * buscador con Enter. Mientras navega marca data-pendiente, que la tarjeta de resultados usa para atenuarse.
 *
 * Ningún control se vuelve a montar al cambiar la URL (un key le sacaba el foco al que se estaba usando): los selects
 * son controlados y el buscador se actualiza a mano cuando no se tipeó nada distinto de lo que mostraba.
 */
export function FiltersQuotes({ filters, clientes }: { filters: FiltersList; clientes: ClientFilter[] }) {
  const router = useRouter()
  const [pending, iniciarNavigation] = useTransition()
  // Los de la URL, o los recién elegidos mientras se navega hacia ellos. Sin navegación pendiente son `filtros`, así
  // que los selects siguen a la URL cuando cambia desde afuera (chips, "Limpiar filtros", atrás del navegador).
  const [vigentes, adelantar] = useOptimistic(
    filters,
    (actuales: FiltersList, changes: Partial<FiltersList>): FiltersList => ({ ...actuales, ...changes }),
  )
  const search = useRef<HTMLInputElement>(null)
  // La última búsqueda de la URL que se reflejó en el buscador.
  const qReflejada = useRef(filters.q)

  // Si la búsqueda cambia desde afuera ("Limpiar filtros", atrás o adelante del navegador), el buscador vuelve a leer
  // la URL aunque tenga el foco, salvo que se haya tipeado algo distinto de lo que mostraba: eso no se pisa. Se decide
  // por el contenido y no por el foco porque después de buscar con Enter el foco se queda en el buscador.
  useEffect(() => {
    const field = search.current
    // El texto se normaliza como el de la URL (espacios, largo máximo) para compararlo con la búsqueda que mostraba.
    if (field && readFilters({ q: field.value }).q === qReflejada.current) field.value = filters.q
    qReflejada.current = filters.q
  }, [filters.q])

  function apply(changes: Partial<FiltersList>) {
    iniciarNavigation(() => {
      adelantar(changes)
      // Sobre `vigentes`: dos cambios seguidos no se pisan aunque el primero todavía no haya llegado a la URL.
      router.push(hrefWithFilters(vigentes, changes), { scroll: false })
    })
  }

  // Los chips siguen la selección optimista mientras llega la navegación.
  const chips: { clave: string; texto: string; quitar: Partial<FiltersList> }[] = []
  if (vigentes.q) {
    chips.push({ clave: 'busqueda', texto: `Búsqueda: ${vigentes.q}`, quitar: { q: '' } })
  }
  if (vigentes.estado) {
    chips.push({ clave: 'estado', texto: STATUSES_QUOTE[vigentes.estado].label, quitar: { estado: '' } })
  }
  if (vigentes.cliente) {
    const cliente = clientes.find((c) => c.id === vigentes.cliente)
    chips.push({ clave: 'cliente', texto: cliente?.razon_social ?? 'Cliente', quitar: { cliente: '' } })
  }
  if (vigentes.desde || vigentes.hasta) {
    const texto = textRangoDates(vigentes.desde, vigentes.hasta)
    chips.push({ clave: 'fechas', texto, quitar: { desde: '', hasta: '' } })
  }

  return (
    <div data-pendiente={pending ? '' : undefined} aria-busy={pending} className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @min-[44rem]/listado:grid-cols-3 @min-[48rem]/listado:grid-cols-[minmax(0,1fr)_11rem_11.5rem_12.5rem]">
        <form
          role="search"
          className="relative @min-[44rem]/listado:col-span-3 @min-[48rem]/listado:col-span-1"
          onSubmit={(evento) => {
            evento.preventDefault()
            const q = new FormData(evento.currentTarget).get('q')
            apply({ q: typeof q === 'string' ? q.trim() : '' })
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={search}
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Buscar cotizaciones…"
            aria-label="Buscar cotizaciones"
            className="h-11 bg-background pl-9 @min-[44rem]/listado:h-10"
          />
          <button type="submit" className="sr-only">
            Buscar
          </button>
        </form>

        <FiltersMobile filters={vigentes} clientes={clientes} activos={chips.length} onApply={apply} />

        {/* pr-7 y no el pr-8 del select: con 160 px, "Todos los estados" se cortaba antes de la flecha. */}
        <NativeSelect
          aria-label="Estado"
          value={vigentes.estado}
          onChange={(evento) => apply({ estado: aStatus(evento.target.value) })}
          className="hidden min-w-0 w-full @min-[44rem]/listado:block [&>select]:h-10 [&>select]:truncate [&>select]:bg-background [&>select]:pr-7"
        >
          <OptionsStatus />
        </NativeSelect>
        <NativeSelect
          aria-label="Cliente"
          value={vigentes.cliente}
          onChange={(evento) => apply({ cliente: evento.target.value })}
          className="hidden min-w-0 w-full @min-[44rem]/listado:block [&>select]:h-10 [&>select]:truncate [&>select]:bg-background [&>select]:pr-7"
        >
          <OptionsClient clientes={clientes} />
        </NativeSelect>
        <SelectorDates
          desde={vigentes.desde}
          hasta={vigentes.hasta}
          onApply={apply}
          className="hidden @min-[44rem]/listado:flex"
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.clave}
              type="button"
              aria-label={`Quitar filtro ${chip.texto}`}
              title={chip.texto}
              onClick={() => apply(chip.quitar)}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[13px] text-primary transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50 @min-[44rem]/listado:min-h-8 @min-[44rem]/listado:max-w-72"
            >
              <span className="truncate">{chip.texto}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          ))}
          {chips.length > 1 ? (
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => apply({ q: '', estado: '', cliente: '', desde: '', hasta: '' })}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      ) : null}
      <span role="status" className="sr-only">{pending ? 'Actualizando cotizaciones…' : ''}</span>
    </div>
  )
}
