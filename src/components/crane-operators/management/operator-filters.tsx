'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CraneOperatorFilters } from '@/lib/crane-operators/management-schemas'

export function OperatorFilters({ filters }: { filters: CraneOperatorFilters }) {
  const filtered = Boolean(filters.q || filters.active !== 'all')
  return <form action="/crane-operators" method="get" role="search" className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
    <div className="relative min-w-0">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input key={filters.q} name="q" aria-label="Buscar gruistas" placeholder="Nombre, email o grúa" type="search" defaultValue={filters.q} maxLength={200} className="h-10 pl-9" />
    </div>
    <NativeSelect key={filters.active} name="active" aria-label="Estado del acceso" defaultValue={filters.active} className="w-full [&>select]:h-10" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      <NativeSelectOption value="all">Todos los estados</NativeSelectOption>
      <NativeSelectOption value="active">Activos</NativeSelectOption>
      <NativeSelectOption value="inactive">Inactivos</NativeSelectOption>
    </NativeSelect>
    <Button type="submit" variant="outline" className="h-10">Buscar</Button>
    {filtered ? <div className="col-span-full flex flex-wrap items-center gap-3 text-sm"><span className="text-muted-foreground">Filtros activos</span><Link href="/crane-operators" className="inline-flex min-h-11 items-center text-primary hover:underline">Limpiar filtros</Link></div> : null}
  </form>
}
