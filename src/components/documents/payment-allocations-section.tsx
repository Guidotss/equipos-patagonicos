import { useMemo } from 'react'
import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  centsToDecimal,
  formatFinancialAmount,
  parseAmountCents,
  sumCents,
} from '@/lib/finance/amounts'
import type { PaymentAllocation } from '@/lib/finance/contracts'
import type { DocumentContext } from '@/lib/documents/screens'
import type { DocumentFinanceState } from './use-document-finance'
import { paymentInvoiceCapacity } from './payment-capacity'

type Props = {
  finance: DocumentFinanceState
  context: DocumentContext
  selectedBudgetIds: string[]
  total: string
  errors: Record<string, string>
  persistedIds: Set<string>
  persistedAllocations: PaymentAllocation[]
}
const label = (kind: string) =>
  ({
    cash: 'Efectivo',
    transfer: 'Transferencia',
    check: 'Cheque',
    withholding: 'Retención',
    legacy_unidentified: 'Medio anterior sin identificar',
  })[kind] ?? kind
const amount = (value: string) => parseAmountCents(value) ?? BigInt(0)

export function PaymentAllocationsSection({
  finance,
  context,
  selectedBudgetIds,
  total,
  errors,
  persistedIds,
  persistedAllocations,
}: Props) {
  const { paymentAllocations: rows, paymentInstruments: instruments } =
    finance.snapshot
  const active = instruments.filter((item) => item.status !== 'voided')
  const money = sumCents(
    active
      .filter(
        (item) =>
          ['confirmed', 'cleared'].includes(item.status) &&
          item.kind !== 'withholding',
      )
      .map((item) => amount(item.amount)),
  )
  const withholding = sumCents(
    active
      .filter(
        (item) => item.status === 'confirmed' && item.kind === 'withholding',
      )
      .map((item) => amount(item.amount)),
  )
  const pending = sumCents(
    active
      .filter((item) => item.kind === 'check' && item.status === 'pending')
      .map((item) => amount(item.amount)),
  )
  const legacy = sumCents(
    active
      .filter((item) => item.status === 'legacy_recognized')
      .map((item) => amount(item.amount)),
  )
  const remainder = (item: (typeof active)[number]) =>
    amount(item.amount) -
    sumCents(
      rows
        .filter((row) => row.instrumentId === item.id)
        .map((row) => amount(row.amount)),
    )
  const unassigned = sumCents(
    active
      .filter((item) =>
        ['confirmed', 'cleared', 'legacy_recognized'].includes(item.status),
      )
      .map(remainder),
  )
  const pendingUnassigned = sumCents(
    active
      .filter((item) => item.kind === 'check' && item.status === 'pending')
      .map(remainder),
  )
  const unclassified = sumCents(
    active
      .filter((item) => item.status === 'legacy_unclassified')
      .map((item) => amount(item.amount)),
  )
  function change(index: number, patch: Partial<PaymentAllocation>) {
    finance.updateAllocations(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    )
  }
  const capacity = useMemo(
    () => paymentInvoiceCapacity(context, persistedIds, finance.snapshot),
    [context, persistedIds, finance.snapshot],
  )
  return (
    <Card
      titulo="Aplicación del cobro"
      descripcion="Asigná cada porción de un medio a un trabajo y, si corresponde, a una factura."
    >
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const prefix = `payment-allocation-${row.id ?? index}`
          return (
            <div
              key={row.id ?? index}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field id={`${prefix}-instrument`} label="Medio">
                <NativeSelect
                  id={`${prefix}-instrument`}
                  className="w-full"
                  value={row.instrumentId}
                  onChange={(event) =>
                    change(index, { instrumentId: event.target.value })
                  }
                >
                  {active.map((item, number) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {label(item.kind)} {number + 1}
                    </NativeSelectOption>
                  ))}
                  {!active.some((item) => item.id === row.instrumentId) ? (
                    <NativeSelectOption value={row.instrumentId}>
                      Medio anulado o no disponible
                    </NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field id={`${prefix}-budget`} label="Trabajo">
                <NativeSelect
                  id={`${prefix}-budget`}
                  className="w-full"
                  value={row.budgetId ?? ''}
                  onChange={(event) =>
                    change(index, {
                      budgetId: event.target.value || null,
                      invoiceId: null,
                    })
                  }
                >
                  <NativeSelectOption value="">
                    Trabajo desconocido
                  </NativeSelectOption>
                  {context.budgets
                    .filter((item) => selectedBudgetIds.includes(item.id))
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        N° {item.numero} · {item.asunto}
                      </NativeSelectOption>
                    ))}
                  {row.budgetId &&
                  !context.budgets.some(
                    (item) =>
                      selectedBudgetIds.includes(item.id) &&
                      item.id === row.budgetId,
                  ) ? (
                    <NativeSelectOption value={row.budgetId}>
                      Trabajo anterior no disponible
                    </NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field id={`${prefix}-invoice`} label="Factura (opcional)">
                <NativeSelect
                  id={`${prefix}-invoice`}
                  className="w-full"
                  value={row.invoiceId ?? ''}
                  onChange={(event) =>
                    change(index, { invoiceId: event.target.value || null })
                  }
                >
                  <NativeSelectOption value="">Sin factura</NativeSelectOption>
                  {context.facturas
                    .filter(
                      (item) =>
                        item.id &&
                        item.tipo_comprobante !== 'NC' &&
                        (item.id === row.invoiceId ||
                          capacity(item.id, row) > BigInt(0)),
                    )
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id!}>
                        {item.tipo_comprobante} {item.numero || 'Sin número'}
                      </NativeSelectOption>
                    ))}
                  {row.invoiceId &&
                  !context.facturas.some(
                    (item) => item.id === row.invoiceId,
                  ) ? (
                    <NativeSelectOption value={row.invoiceId}>
                      Factura anulada o no disponible
                    </NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field
                id={`${prefix}-amount`}
                label="Importe"
                error={errors[`finance.paymentAllocations.${index}.amount`]}
              >
                <Input
                  id={`${prefix}-amount`}
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(event) =>
                    change(index, { amount: event.target.value })
                  }
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  finance.updateAllocations(
                    rows.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
              >
                Quitar destino {index + 1}
              </Button>
              {(!row.invoiceId ||
                context.documentos.some(
                  (item) =>
                    item.id === row.invoiceId &&
                    item.tipo === 'factura' &&
                    item.deleted_at,
                )) &&
              row.budgetId &&
              row.id &&
              persistedAllocations.some(
                (item) =>
                  item.id === row.id &&
                  item.instrumentId === row.instrumentId &&
                  item.budgetId === row.budgetId &&
                  item.invoiceId === row.invoiceId,
              ) &&
              persistedIds.has(row.instrumentId) &&
              instruments.some(
                (item) =>
                  item.id === row.instrumentId &&
                  ['confirmed', 'cleared', 'legacy_recognized'].includes(
                    item.status,
                  ),
              ) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    document.getElementById(`${prefix}-invoice`)?.focus()
                  }
                >
                  Aplicar anticipo
                </Button>
              ) : null}
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          disabled={!active.length}
          onClick={() =>
            finance.updateAllocations([
              ...rows,
              {
                id: crypto.randomUUID(),
                instrumentId: active[0].id,
                budgetId: null,
                invoiceId: null,
                amount: '',
              },
            ])
          }
        >
          Agregar destino
        </Button>
        <p className="text-sm text-muted-foreground">
          Sin factura, un medio acreditado queda como anticipo del trabajo. Un
          cheque pendiente expresa solo un destino previsto.
        </p>
        <div className="grid gap-2 rounded-md bg-muted p-4 text-sm sm:grid-cols-2">
          <p>
            Importe de la orden:{' '}
            {parseAmountCents(total) === null
              ? '—'
              : formatFinancialAmount(centsToDecimal(parseAmountCents(total)!))}
          </p>
          <p>
            Cancelado:{' '}
            {formatFinancialAmount(
              centsToDecimal(money + withholding + legacy),
            )}
          </p>
          <p>
            Dinero acreditado: {formatFinancialAmount(centsToDecimal(money))}
          </p>
          <p>
            Retenciones: {formatFinancialAmount(centsToDecimal(withholding))}
          </p>
          {legacy > BigInt(0) ? (
            <p>
              Cancelación anterior sin medio identificado:{' '}
              {formatFinancialAmount(centsToDecimal(legacy))}
            </p>
          ) : null}
          <p>
            Cheques pendientes: {formatFinancialAmount(centsToDecimal(pending))}
          </p>
          <p>
            Reconocido sin asignar a un trabajo:{' '}
            {formatFinancialAmount(centsToDecimal(unassigned))}
          </p>
          {pendingUnassigned > BigInt(0) ? (
            <p>
              Cheques pendientes sin destino:{' '}
              {formatFinancialAmount(centsToDecimal(pendingUnassigned))}
            </p>
          ) : null}
          {unclassified > BigInt(0) ? (
            <p>
              Importe anterior sin clasificar:{' '}
              {formatFinancialAmount(centsToDecimal(unclassified))}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
