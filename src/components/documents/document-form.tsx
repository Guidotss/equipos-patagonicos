'use client'

import { ActionsForm, SheetForm } from '@/components/form/structure-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoaderCircle } from 'lucide-react'

import { DocumentAttachmentsSection } from './document-attachments-section'
import { DocumentBudgetTypeSection } from './document-budget-type-section'
import { DocumentDetailsSection } from './document-details-section'
import { documentFormSelections } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import {
  LinkedBudgetsSection,
  InvoiceDeliveryNotesSection,
  PaymentAllocationsSection,
} from './document-related-sections'
import { useDocumentForm } from './use-document-form'

export function DocumentForm(props: DocumentFormProps) {
  const { options, budgetId = '', document, filesExisting = [], initialAllocations = [], quote } = props
  const form = useDocumentForm(props)
  const {
    pending,
    context,
    selectedBudgetIds,
    setSelectedBudgetIds,
    clientId,
    loading,
    searchBudget,
    setSearchBudget,
    values,
    deliveryNotes,
    setDeliveryNotes,
    allocations,
    removedFileIds: remove,
    setRemovedFileIds,
    uploading,
    message,
    errors,
    onChangeFiles,
    changeField,
    chooseBudget,
    changeAllocation,
    save,
  } = form
  const { duplicate, clientBudgets, availableDeliveryNotes, voidedInvoices, visibleOptions } =
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
      <fieldset disabled={pending || loading} className="min-w-0">
        <legend className="sr-only">Contenido del documento</legend>
        <SheetForm>
          <DocumentBudgetTypeSection
            document={document}
            quote={quote}
            searchBudget={searchBudget}
            setSearchBudget={setSearchBudget}
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
            context={context}
            duplicate={duplicate}
          />
          {!quote && clientBudgets.length ? (
            <LinkedBudgetsSection
              clientBudgets={clientBudgets}
              selectedBudgetIds={selectedBudgetIds}
              setSelectedBudgetIds={setSelectedBudgetIds}
            />
          ) : null}
          {values.tipo === 'factura' ? (
            <InvoiceDeliveryNotesSection
              availableDeliveryNotes={availableDeliveryNotes}
              deliveryNotes={deliveryNotes}
              setDeliveryNotes={setDeliveryNotes}
            />
          ) : null}
          {values.tipo === 'orden_pago' ? (
            <PaymentAllocationsSection
              voidedInvoices={voidedInvoices}
              allocations={allocations}
              changeAllocation={changeAllocation}
              context={context}
              initialAllocations={initialAllocations}
            />
          ) : null}
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
        disabled={uploading || loading || !clientId}
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
