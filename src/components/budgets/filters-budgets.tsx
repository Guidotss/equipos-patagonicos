'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ESTADOS_PRESUPUESTO, type FiltrosPresupuestos as Filtros } from '@/lib/presupuestos/lista'

export function FiltrosPresupuestos({
  filtros,
  clientes,
}: {
  filtros: Filtros
  clientes: { id: string; razon_social: string }[]
}) {
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.cliente)
  return (
    <form
      action="/presupuestos"
      method="get"
      className="grid min-w-0 grid-cols-1 items-center gap-3 @min-[28rem]/listado:grid-cols-2 @min-[44rem]/listado:grid-cols-[minmax(0,1fr)_11rem_minmax(0,12rem)_auto]"
      role="search"
    >
      <div className="relative min-w-0 @min-[28rem]/listado:col-span-2 @min-[44rem]/listado:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          key={filtros.q}
          id="q"
          type="search"
          name="q"
          defaultValue={filtros.q}
          aria-label="Buscar presupuestos"
          placeholder="Número, cliente o trabajo"
          maxLength={100}
          className="h-10 bg-background pl-9"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="estado" className="sr-only">Estado</label>
        <NativeSelect
          key={filtros.estado}
          id="estado"
          name="estado"
          defaultValue={filtros.estado}
          className="w-full [&>select]:h-10"
          onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
        >
          <NativeSelectOption value="">Todos los estados</NativeSelectOption>
          {Object.entries(ESTADOS_PRESUPUESTO).map(([estado, etiqueta]) => (
            <NativeSelectOption key={estado} value={estado}>{etiqueta}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="min-w-0">
        <label htmlFor="cliente" className="sr-only">Cliente</label>
        <NativeSelect
          key={filtros.cliente}
          id="cliente"
          name="cliente"
          defaultValue={filtros.cliente}
          title={clientes.find((cliente) => cliente.id === filtros.cliente)?.razon_social}
          className="w-full [&>select]:h-10"
          onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
        >
          <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
          {clientes.map((cliente) => (
            <NativeSelectOption key={cliente.id} value={cliente.id}>{cliente.razon_social}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline" className="h-10 @min-[28rem]/listado:col-span-2 @min-[44rem]/listado:col-span-1">Buscar</Button>
      {hayFiltros ? (
        <div className="col-span-full flex flex-wrap items-center gap-x-3 text-sm">
          <span className="text-muted-foreground">Filtros activos</span>
          <Link href="/presupuestos" className="inline-flex min-h-10 items-center text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11">Limpiar filtros</Link>
        </div>
      ) : null}
    </form>
  )
}
