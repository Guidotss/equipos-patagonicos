'use client'

import { useSyncExternalStore } from 'react'
import { ActionsForm, SheetForm } from '@/components/form/structure-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoaderCircle } from 'lucide-react'
import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Input } from '@/components/ui/input'

import { DocumentAttachmentsSection } from './document-attachments-section'
import { DocumentBudgetTypeSection } from './document-budget-type-section'
import { DocumentDetailsSection } from './document-details-section'
import { documentFormSelections } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import {
  DeliveryNoteInvoiceSection,
  LinkedBudgetsSection,
  InvoiceDeliveryNotesSection,
} from './document-related-sections'
import { PaymentAllocationsSection } from './payment-allocations-section'
import { PaymentInstrumentsSection } from './payment-instruments-section'
import { InvoiceAllocationsSection } from './invoice-allocations-section'
import { useDocumentForm } from './use-document-form'

const subscribeToFormReadiness = () => () => undefined
const isBrowserFormReady = () => true
const isServerFormReady = () => false

export function DocumentForm(props: DocumentFormProps) {
  const { options, budgetId = '', document, filesExisting = [], quote } = props
  // Las selecciones necesitan sus eventos de React antes de aceptar cambios.
  const ready = useSyncExternalStore(subscribeToFormReadiness, isBrowserFormReady, isServerFormReady)
  const form = useDocumentForm(props)
  const {
    pending,
    context,
    selectedBudgetIds,
    setSelectedBudgetIds,
    clientId,
    loading,
    equipment,
    equipmentLabel,
    contextReady,
    values,
    deliveryNotes,
    setDeliveryNotes,
    removedFileIds: remove,
    setRemovedFileIds,
    uploading,
    message,
    errors,
    onChangeFiles,
    changeField,
    chooseBudget,
    save,
    finance,
    statusPending,
    statusErrors,
    changeStatus,
  } = form
  const { duplicate, clientBudgets, availableDeliveryNotes, visibleOptions } =
    documentFormSelections({ ...form, options, document })
  const back = budgetId ? `/presupuestos/${budgetId}` : '/presupuestos'

  return (
    <form onSubmit={save} id="nuevo-documento" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-28">
      {message ? (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {quote ? (
        <Alert>
          <AlertDescription>
            Al guardar la orden de compra también se aprueba la cotización y se conserva su PDF.
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!ready || pending || loading || statusPending} className="min-w-0">
        <legend className="sr-only">Contenido del documento</legend>
        <SheetForm>
          <DocumentBudgetTypeSection
            document={document}
            quote={quote}
            errors={errors}
            selectedBudgetIds={selectedBudgetIds}
            chooseBudget={chooseBudget}
            values={values}
            changeField={changeField}
            visibleOptions={visibleOptions}
          />
          <DocumentAttachmentsSection
            filesExisting={filesExisting}
            removedFileIds={remove}
            setRemovedFileIds={setRemovedFileIds}
            clientId={clientId}
            pending={pending}
            onChangeFiles={onChangeFiles}
            errors={errors}
          />
          <DocumentDetailsSection
            values={values}
            changeField={changeField}
            errors={errors}
            equipment={equipment}
            equipmentLabel={equipmentLabel}
            duplicate={duplicate}
          />
          {values.tipo === 'remito' ? <DeliveryNoteInvoiceSection {...form} /> : null}
          {!quote && clientBudgets.length ? (
            <LinkedBudgetsSection
              clientBudgets={clientBudgets}
              selectedBudgetIds={selectedBudgetIds}
              setSelectedBudgetIds={setSelectedBudgetIds}
            />
          ) : null}
          {values.tipo === 'factura' ? (
            <><InvoiceDeliveryNotesSection
              availableDeliveryNotes={availableDeliveryNotes}
              deliveryNotes={deliveryNotes}
              setDeliveryNotes={setDeliveryNotes}
            /><InvoiceAllocationsSection finance={finance} context={context} selectedBudgetIds={selectedBudgetIds}
              total={values.monto} isNew={!document} errors={errors} invoiceBudget={form.invoiceBudget}
              assignTotal={form.assignInvoiceTotal} setAssignTotal={form.setAssignInvoiceTotal} /></>
          ) : null}
          {values.tipo === 'orden_pago' ? (
            <>
              <Card titulo="Condición de pago"><Field id="payment-condition" label="Condición de pago (opcional)"><Input id="payment-condition" maxLength={200} value={finance.condition} onChange={(event) => finance.setCondition(event.target.value)} /></Field></Card>
              <PaymentInstrumentsSection finance={finance} persistedIds={finance.persistedInstruments} onStatus={changeStatus} errors={statusErrors} fieldErrors={errors} />
              <PaymentAllocationsSection finance={finance} context={context} selectedBudgetIds={selectedBudgetIds} total={values.monto} errors={errors} persistedIds={finance.persistedInstruments} persistedAllocations={finance.persistedAllocations} />
            </>
          ) : null}
          {document && (values.tipo === 'factura' || values.tipo === 'orden_pago') ? <Card titulo="Motivo de corrección"><Field id="financial-reason" label="Motivo (cuando corresponda)" error={errors['finance.correctionReason']}><Input id="financial-reason" maxLength={2000} value={finance.reason} onChange={(event) => finance.setReason(event.target.value)} /></Field></Card> : null}
        </SheetForm>
      </fieldset>
      {Object.entries(errors)
        .filter(([field]) => !field.startsWith('datos.') && field !== 'archivos')
        .map(([field, error]) => (
          <p key={field} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      <ActionsForm
        back={back}
        textButton={document ? 'Guardar cambios' : quote ? 'Aprobar y guardar OC' : 'Guardar documento'}
        pendiente={pending}
        disabled={!ready || statusPending || uploading || loading || !clientId || !contextReady || (values.tipo === 'remito' && equipment.ambiguous)}
      >
        {uploading || loading ? (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            <span className="sr-only sm:not-sr-only">{uploading ? 'Subiendo archivos…' : 'Cargando documentos…'}</span>
          </span>
        ) : null}
      </ActionsForm>
    </form>
  )
}
