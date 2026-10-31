import { Card } from '@/components/form/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatAmountTable, formatCurrency } from '@/lib/format/amounts'
import Link from 'next/link'

import { changeList, type documentFormSelections } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import type { DocumentFormState } from './use-document-form'

type RelatedSelections = ReturnType<typeof documentFormSelections>

export function LinkedBudgetsSection({
  clientBudgets,
  selectedBudgetIds,
  setSelectedBudgetIds,
}: Pick<RelatedSelections, 'clientBudgets'> & Pick<DocumentFormState, 'selectedBudgetIds' | 'setSelectedBudgetIds'>) {
  return (
    <Card
      titulo="Presupuestos vinculados"
      descripcion="Podés compartir este documento entre presupuestos del mismo cliente."
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Presupuestos vinculados</legend>
        {clientBudgets.map((item) => (
          <label key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={selectedBudgetIds.includes(item.id)}
              onChange={(event) => setSelectedBudgetIds((list) => changeList(list, item.id, event.target.checked))}
            />
            <span>
              N° {item.numero} · {item.asunto}
            </span>
          </label>
        ))}
      </fieldset>
    </Card>
  )
}

export function InvoiceDeliveryNotesSection({
  availableDeliveryNotes,
  deliveryNotes,
  setDeliveryNotes,
}: Pick<RelatedSelections, 'availableDeliveryNotes'> & Pick<DocumentFormState, 'deliveryNotes' | 'setDeliveryNotes'>) {
  return (
    <Card titulo="Remitos que cubre" descripcion="Elegí los remitos del cliente incluidos en esta factura.">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Remitos que cubre</legend>
        {availableDeliveryNotes.length ? (
          availableDeliveryNotes.map((item) => (
            <label key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={deliveryNotes.includes(item.id)}
                onChange={(event) => setDeliveryNotes((list) => changeList(list, item.id, event.target.checked))}
              />
              <span>
                Remito {item.numero || 'sin número'}
                {item.deleted_at ? (
                  <span className="block text-xs text-destructive">
                    Anulado: desmarcalo para desvincularlo o{' '}
                    <Link href={`/documentos/${item.id}`} className="underline">
                      abrilo para restaurarlo
                    </Link>
                    .
                  </span>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No hay remitos pendientes de facturar.</p>
        )}
      </fieldset>
    </Card>
  )
}

export function PaymentAllocationsSection({
  voidedInvoices,
  allocations,
  changeAllocation,
  context,
  initialAllocations,
}: Pick<RelatedSelections, 'voidedInvoices'> &
  Pick<DocumentFormState, 'allocations' | 'changeAllocation' | 'context'> & {
    initialAllocations: NonNullable<DocumentFormProps['initialAllocations']>
  }) {
  return (
    <Card titulo="Facturas que cancela" descripcion="El importe se completa con el saldo disponible; podés ajustarlo.">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Facturas que cancela</legend>
        {voidedInvoices.map((item) => (
          <Alert key={item.id} variant="destructive">
            <AlertDescription>
              <p>
                La factura {item.numero || 'sin número'} está anulada.{' '}
                <Link href={`/documentos/${item.id}`} className="underline">
                  Abrila para restaurarla
                </Link>{' '}
                o quitá esta aplicación antes de guardar.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => changeAllocation(item.id, null)}>
                Desvincular factura {item.numero || 'sin número'}
              </Button>
            </AlertDescription>
          </Alert>
        ))}
        {context.facturas
          .filter(
            (item) =>
              item.tipo_comprobante !== 'NC' &&
              ((item.saldo ?? 0) > 0 || (item.id && allocations[item.id] !== undefined)),
          )
          .map((item) => {
            const id = item.id!
            const available =
              (item.saldo ?? 0) +
              (initialAllocations.find((allocation) => allocation.factura_id === id)?.monto_aplicado ?? 0)
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={allocations[id] !== undefined}
                    onChange={(event) =>
                      changeAllocation(id, event.target.checked ? formatAmountTable(available) : null)
                    }
                  />
                  <span>
                    {[item.tipo_comprobante, item.numero || 'Sin número'].join(' ')}
                    <span className="block text-xs text-muted-foreground">
                      Saldo disponible {formatCurrency(available)}
                    </span>
                  </span>
                </label>
                {allocations[id] !== undefined ? (
                  <Input
                    className="w-36"
                    aria-label={`Importe aplicado a ${item.numero || 'factura sin número'}`}
                    inputMode="decimal"
                    value={allocations[id]}
                    onChange={(event) => changeAllocation(id, event.target.value)}
                    required
                  />
                ) : null}
              </div>
            )
          })}
        {!context.facturas.some(
          (item) =>
            item.tipo_comprobante !== 'NC' &&
            ((item.saldo ?? 0) > 0 || (item.id && allocations[item.id] !== undefined)),
        ) ? (
          <p className="text-sm text-muted-foreground">No hay facturas con saldo para este cliente.</p>
        ) : null}
      </fieldset>
    </Card>
  )
}
