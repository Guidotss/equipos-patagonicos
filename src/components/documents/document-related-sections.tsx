import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { numberDocument } from '@/lib/documents/screens'
import { formatCurrency } from '@/lib/format/amounts'
import { formatShortDate } from '@/lib/format/dates'
import Link from 'next/link'

import { changeList, type documentFormSelections } from './document-form-model'
import type { DocumentFormState } from './use-document-form'

type RelatedSelections = ReturnType<typeof documentFormSelections>

export function DeliveryNoteInvoiceSection({
  linkedInvoice,
  selectableInvoices,
  selectedInvoiceId,
  setRequestedInvoiceId,
}: Pick<DocumentFormState, 'linkedInvoice' | 'selectableInvoices' | 'selectedInvoiceId' | 'setRequestedInvoiceId'>) {
  if (linkedInvoice) {
    return (
      <Card titulo="Factura vinculada">
        <Link href={`/documentos/${linkedInvoice.id}`} className="text-sm text-primary underline underline-offset-2">
          {numberDocument(linkedInvoice)}
        </Link>
      </Card>
    )
  }
  if (!selectableInvoices.length) return null
  return (
    <Card titulo="Facturación del remito">
      <Field id="delivery-note-invoice" label="Factura existente (opcional)" help="Elegí la factura que cubre este remito. Si todavía no corresponde ninguna, dejalo sin vincular.">
        <NativeSelect
          id="delivery-note-invoice"
          className="w-full sm:max-w-md"
          value={selectedInvoiceId}
          onChange={(event) => setRequestedInvoiceId(event.target.value)}
        >
          <NativeSelectOption value="">Sin vincular</NativeSelectOption>
          {selectableInvoices.map((invoice) => (
            <NativeSelectOption key={invoice.id} value={invoice.id}>
              {[numberDocument(invoice), invoice.fecha ? formatShortDate(invoice.fecha) : 'Sin fecha',
                invoice.monto === null ? null : formatCurrency(invoice.monto)].filter(Boolean).join(' · ')}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </Card>
  )
}

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
              <span className="min-w-0 [overflow-wrap:anywhere]">
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
