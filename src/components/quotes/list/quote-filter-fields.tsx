import { STATUSES_QUOTE } from '@/components/quotes/status-quote'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelectOption } from '@/components/ui/native-select'
import { STATUSES_FILTER } from '@/lib/quotes/list'
import { useId } from 'react'

import type { ClientFilter, DateRange } from './quote-filter-model'

const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'

export function WarningRango() {
  return <p className="text-sm text-destructive">“Hasta” es anterior a “Desde”.</p>
}

export function OptionsStatus() {
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

export function OptionsClient({ clientes }: { clientes: ClientFilter[] }) {
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
export function FieldsRango({
  rango,
  onChange,
  alto,
}: {
  rango: DateRange
  onChange: (rango: DateRange) => void
  alto: string
}) {
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
