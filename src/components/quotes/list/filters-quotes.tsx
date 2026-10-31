'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { type FiltersList } from '@/lib/quotes/list'
import { Search, X } from 'lucide-react'

import { SelectorDates } from './quote-date-selector'
import { OptionsClient, OptionsStatus } from './quote-filter-fields'
import { readFilterStatus, type ClientFilter } from './quote-filter-model'
import { FiltersMobile } from './quote-filters-mobile'
import { useQuoteFilters } from './use-quote-filters'

/**
 * Buscador y filtros de la lista. Todo vive en la URL (hrefConFiltros): los selects y las fechas navegan solos y el
 * buscador con Enter. Mientras navega marca data-pendiente, que la tarjeta de resultados usa para atenuarse.
 *
 * Ningún control se vuelve a montar al cambiar la URL (un key le sacaba el foco al que se estaba usando): los selects
 * son controlados y el buscador se actualiza a mano cuando no se tipeó nada distinto de lo que mostraba.
 */
export function FiltersQuotes({ filters, clientes }: { filters: FiltersList; clientes: ClientFilter[] }) {
  const { pending, vigentes, search, apply, chips } = useQuoteFilters(filters, clientes)

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
          onChange={(evento) => apply({ estado: readFilterStatus(evento.target.value) })}
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
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => apply({ q: '', estado: '', cliente: '', desde: '', hasta: '' })}
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      ) : null}
      <span role="status" className="sr-only">
        {pending ? 'Actualizando cotizaciones…' : ''}
      </span>
    </div>
  )
}
