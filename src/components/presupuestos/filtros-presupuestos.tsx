'use client'

import { Search } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ESTADOS_PRESUPUESTO, type FiltrosPresupuestos } from '@/lib/presupuestos/lista'

export function FiltrosPresupuestos({
  filtros,
  clientes,
}: {
  filtros: FiltrosPresupuestos
  clientes: { id: string; razon_social: string }[]
}) {
  return (
    <form action="/presupuestos" className="flex flex-wrap items-end gap-3" role="search">
      <Campo id="q" etiqueta="Buscar" className="min-w-48 flex-1">
        <Input
          id="q"
          type="search"
          name="q"
          defaultValue={filtros.q}
          aria-label="Buscar presupuestos"
          placeholder="Número, cliente o trabajo"
          maxLength={100}
        />
      </Campo>
      <Campo id="cliente" etiqueta="Cliente">
        <NativeSelect
          id="cliente"
          name="cliente"
          defaultValue={filtros.cliente}
          className="w-full max-w-72"
          onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
        >
          <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
          {clientes.map((cliente) => (
            <NativeSelectOption key={cliente.id} value={cliente.id}>
              {cliente.razon_social}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Campo>
      <Campo id="estado" etiqueta="Estado">
        <NativeSelect
          id="estado"
          name="estado"
          defaultValue={filtros.estado}
          onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
        >
          <NativeSelectOption value="">Todos los estados</NativeSelectOption>
          {Object.entries(ESTADOS_PRESUPUESTO).map(([estado, etiqueta]) => (
            <NativeSelectOption key={estado} value={estado}>
              {etiqueta}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Campo>
      <Button type="submit" variant="outline">
        <Search data-icon="inline-start" />
        Buscar
      </Button>
    </form>
  )
}
