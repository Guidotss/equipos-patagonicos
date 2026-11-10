import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { centsToDecimal, formatFinancialAmount, parseAmountCents, sumCents } from '@/lib/finance/amounts'
import type { InvoiceAllocation } from '@/lib/finance/contracts'
import type { DocumentContext } from '@/lib/documents/screens'
import type { DocumentFinanceState } from './use-document-finance'

type Props = {
  finance: DocumentFinanceState
  context: DocumentContext
  selectedBudgetIds: string[]
  total: string
  isNew: boolean
  errors: Record<string, string>
}

export function InvoiceAllocationsSection({ finance, context, selectedBudgetIds, total, isNew, errors }: Props) {
  const rows = finance.snapshot.invoiceAllocations
  const history = sumCents(rows.map((row) => parseAmountCents(row.historicalSettledAmount) ?? BigInt(0)))
  const protectedHistory = finance.historicalTotal
  const amounts = rows.map((row) => parseAmountCents(row.amount))
  const totalCents = parseAmountCents(total)
  const remainder = totalCents === null || amounts.some((amount) => amount === null)
    ? null : totalCents - sumCents(amounts as bigint[])
  const unassigned = remainder === null ? null : remainder + sumCents(rows.filter((row) => row.budgetId === null).map((row) => parseAmountCents(row.amount) ?? BigInt(0)))
  function change(index: number, patch: Partial<InvoiceAllocation>) {
    finance.updateInvoices(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }
  function add() {
    const budget = isNew && rows.length === 0 && selectedBudgetIds.length === 1
      ? context.budgets.find((item) => item.id === selectedBudgetIds[0]) : undefined
    finance.updateInvoices([...rows, {
      budgetId: budget?.id ?? null,
      equipmentId: budget?.equipmentId ?? null,
      equipmentStatus: budget?.equipmentId ? 'assigned' : 'unknown',
      amount: budget && remainder !== null && remainder > BigInt(0) ? centsToDecimal(remainder) : '',
      historicalSettledAmount: '0',
    }])
  }
  return (
    <Card titulo="Distribución de factura" descripcion="Indicá el importe correspondiente a cada trabajo y grúa. El resto queda sin distribuir.">
      <div className="flex flex-col gap-4">
        <p className="text-sm">Total de la factura: {totalCents === null ? '—' : formatFinancialAmount(centsToDecimal(totalCents))}</p>
        {rows.map((row, index) => {
          const prefix = `invoice-allocation-${index}`
          return (
            <div key={row.id ?? index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
              <Field id={`${prefix}-budget`} label="Trabajo" error={errors[`finance.invoiceAllocations.${index}.budgetId`]}>
                <NativeSelect id={`${prefix}-budget`} className="w-full" value={row.budgetId ?? ''} onChange={(event) => change(index, { budgetId: event.target.value || null, equipmentId: null, equipmentStatus: 'unknown' })}>
                  <NativeSelectOption value="">Sin distribuir</NativeSelectOption>
                  {context.budgets.filter((budget) => selectedBudgetIds.includes(budget.id)).map((budget) => <NativeSelectOption key={budget.id} value={budget.id}>N° {budget.numero} · {budget.asunto}</NativeSelectOption>)}
                  {row.budgetId && !context.budgets.some((budget) => selectedBudgetIds.includes(budget.id) && budget.id === row.budgetId) ? <NativeSelectOption value={row.budgetId}>Trabajo anterior no disponible</NativeSelectOption> : null}
                </NativeSelect>
              </Field>
              <Field id={`${prefix}-equipment`} label="Grúa" error={errors[`finance.invoiceAllocations.${index}.equipmentStatus`]}>
                <NativeSelect id={`${prefix}-equipment`} className="w-full" disabled={!row.budgetId} value={row.equipmentStatus === 'assigned' ? row.equipmentId ?? '' : row.equipmentStatus} onChange={(event) => {
                  const value = event.target.value
                  change(index, value === 'unknown' || value === 'none' ? { equipmentStatus: value, equipmentId: null } : { equipmentStatus: 'assigned', equipmentId: value })
                }}>
                  <NativeSelectOption value="unknown">Equipo desconocido</NativeSelectOption>
                  <NativeSelectOption value="none">Sin equipo</NativeSelectOption>
                  {context.equipos.map((equipment) => <NativeSelectOption key={equipment.id} value={equipment.id}>{equipment.nombre}{equipment.activo === false ? ' · Inactiva' : ''}</NativeSelectOption>)}
                  {row.equipmentId && !context.equipos.some((equipment) => equipment.id === row.equipmentId) ? <NativeSelectOption value={row.equipmentId}>Equipo anterior no disponible</NativeSelectOption> : null}
                </NativeSelect>
              </Field>
              <Field id={`${prefix}-amount`} label="Importe" error={errors[`finance.invoiceAllocations.${index}.amount`]}>
                <Input id={`${prefix}-amount`} inputMode="decimal" value={row.amount} onChange={(event) => change(index, { amount: event.target.value })} />
              </Field>
              {protectedHistory > BigInt(0) ? <Field id={`${prefix}-history`} label="Cancelación histórica atribuida" error={errors[`finance.invoiceAllocations.${index}.historicalSettledAmount`]}><Input id={`${prefix}-history`} inputMode="decimal" value={row.historicalSettledAmount} onChange={(event) => change(index, { historicalSettledAmount: event.target.value })} /></Field> : null}
              <Button type="button" variant="outline" onClick={() => finance.updateInvoices(rows.filter((_, rowIndex) => rowIndex !== index))}>Quitar distribución {index + 1}</Button>
            </div>
          )
        })}
        <Button type="button" variant="outline" onClick={add}>Agregar distribución</Button>
        <p className="text-sm">Sin distribuir: {unassigned === null ? '—' : formatFinancialAmount(centsToDecimal(unassigned))}</p>
        {protectedHistory > BigInt(0) ? <p className="text-sm text-muted-foreground">Cancelación histórica atribuida: {formatFinancialAmount(centsToDecimal(history))} de {formatFinancialAmount(centsToDecimal(protectedHistory))}. Al modificarla, indicá un motivo.</p> : null}
        <p className="text-sm text-muted-foreground">Sin equipo confirma que no se utilizó una grúa; equipo desconocido conserva el dato pendiente.</p>
      </div>
    </Card>
  )
}
