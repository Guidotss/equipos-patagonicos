import { STATUSES_QUOTE } from '@/components/quotes/status-quote'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelectOption } from '@/components/ui/native-select'
import { STATUSES_FILTER } from '@/lib/quotes/list'
import { useId } from 'react'

import type { ClientFilter, DateRange } from './quote-filter-model'

const LABEL_CLASS = 'text-[13px]/none font-normal text-muted-foreground'

export function DateRangeWarning() {
  return <p className="text-sm text-destructive">“Hasta” es anterior a “Desde”.</p>
}

export function OptionsStatus() {
  return (
    <>
      <NativeSelectOption value="">Todos los estados</NativeSelectOption>
      {STATUSES_FILTER.map((state) => (
        <NativeSelectOption key={state} value={state}>
          {STATUSES_QUOTE[state].label}
        </NativeSelectOption>
      ))}
    </>
  )
}

export function OptionsClient({ clients }: { clients: ClientFilter[] }) {
  return (
    <>
      <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
      {clients.map((client) => (
        <NativeSelectOption key={client.id} value={client.id}>
          {client.razon_social}
        </NativeSelectOption>
      ))}
    </>
  )
}

/** Desde y Hasta como date nativos (sin calendario: no suma dependencias). */
export function DateRangeFields({
  range,
  onChange,
  tall,
}: {
  range: DateRange
  onChange: (range: DateRange) => void
  tall: string
}) {
  const idFrom = useId()
  const idTo = useId()
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={idFrom} className={LABEL_CLASS}>
          Desde
        </Label>
        <Input
          id={idFrom}
          type="date"
          value={range.from}
          max={range.to || undefined}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
          className={tall}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={idTo} className={LABEL_CLASS}>
          Hasta
        </Label>
        <Input
          id={idTo}
          type="date"
          value={range.to}
          min={range.from || undefined}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
          className={tall}
        />
      </div>
    </div>
  )
}
