'use client'

import { changeInstrumentStatus, readDocumentContext, saveDocument } from '@/app/(app)/documentos/actions'
import { AMBIGUOUS_EQUIPMENT_MESSAGE, deliveryNoteEquipment, hasSelectedBudgetContext } from '@/lib/documents/equipment'
import type { UploadedFile } from '@/lib/documents/service'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, useTransition } from 'react'

import {
  EMPTY_DOCUMENT_CONTEXT,
  initialDeliveryNotes,
  initialDocumentValues,
  invoiceCoversBudgets,
  matchingDeliveryNoteInvoices,
  sameIds,
  type DocumentFormValues,
} from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import { useDocumentFinance } from './use-document-finance'
import type { PaymentInstrument } from '@/lib/finance/contracts'
import { parseAmountCents } from '@/lib/finance/amounts'

export type InstrumentStatusError = { message: string } | { settledOn: string }

export function useDocumentForm(props: DocumentFormProps) {
  const {
    options,
    budgetId = '',
    initialContext = EMPTY_DOCUMENT_CONTEXT,
    document,
    linkedBudgetIds = [],
    quote,
  } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const submitting = useRef(false)
  const [context, setContext] = useState(initialContext)
  const [selection, setSelection] = useState({
    budgetIds: linkedBudgetIds.length ? linkedBudgetIds : budgetId ? [budgetId] : [],
    invoiceId: '',
  })
  const { budgetIds: selectedBudgetIds, invoiceId: requestedInvoiceId } = selection
  const [clientId, setClientId] = useState(
    document?.cliente_id ?? options.find((option) => option.id === budgetId)?.cliente_id ?? '',
  )
  const [loading, setLoading] = useState(false)
  const contextRequest = useRef(0)
  const [values, setValues] = useState(() => initialDocumentValues(props))
  const [originalDeliveryNotes] = useState(() => initialDeliveryNotes(props))
  const [deliveryNotes, setDeliveryNotes] = useState(originalDeliveryNotes)
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [remove, setRemovedFileIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const finance = useDocumentFinance(props)
  const [assignInvoiceTotal, setAssignInvoiceTotal] = useState(true)
  const [statusPending, setStatusPending] = useState(false)
  const [statusErrors, setStatusErrors] = useState<Record<string, InstrumentStatusError>>({})
  const statusSubmitting = useRef(false)
  const [initialForm] = useState(() => JSON.stringify({ values, deliveryNotes, selectedBudgetIds }))
  const dirty = finance.dirty || newFiles.length > 0 || remove.length > 0 || uploading ||
    JSON.stringify({ values, deliveryNotes, selectedBudgetIds }) !== initialForm
  const unlinkedInvoice = document?.tipo === 'factura' && values.tipo === 'factura' &&
    !linkedBudgetIds.length && !budgetId && !selectedBudgetIds.length
  const contextReady = Boolean(quote) || unlinkedInvoice || hasSelectedBudgetContext(context, selectedBudgetIds)
  const equipment = deliveryNoteEquipment(context, selectedBudgetIds, document)
  const equipmentLabel = contextReady
    ? equipment.ambiguous ? 'Equipos diferentes' : equipment.name
    : loading ? 'Cargando equipo…' : selectedBudgetIds.length ? 'Volvé a seleccionar el presupuesto' : 'Seleccioná un presupuesto'
  const linkedInvoice = values.tipo === 'remito' && document?.factura_id
    ? context.facturas.find((invoice) => invoice.id === document.factura_id)
    : undefined
  const selectableInvoices = values.tipo === 'remito' && (!document || document.tipo === 'remito') && !linkedInvoice
    ? matchingDeliveryNoteInvoices(context, selectedBudgetIds)
    : []
  const selectedInvoiceId = selectableInvoices.some((invoice) => invoice.id === requestedInvoiceId) ? requestedInvoiceId : ''
  const invoiceBudget = values.tipo === 'factura' && values.tipo_comprobante !== 'NC' && selectedBudgetIds.length === 1
    ? context.budgets.find((budget) => budget.id === selectedBudgetIds[0] && budget.presupuesto_estado !== 'anulado')
    : undefined
  const onChangeFiles = useCallback((files: UploadedFile[], pendingList: boolean) => {
    setNewFiles(files)
    setUploading(pendingList)
  }, [])
  function setRequestedInvoiceId(invoiceId: string) {
    setSelection((previous) => ({ ...previous, invoiceId }))
  }
  function setSelectedBudgetIds(update: (budgetIds: string[]) => string[]) {
    setSelection((previous) => {
      const budgetIds = update(previous.budgetIds)
      const invoiceId = invoiceCoversBudgets(context, previous.invoiceId, budgetIds) ? previous.invoiceId : ''
      return { budgetIds, invoiceId }
    })
  }
  function changeField(field: keyof DocumentFormValues, value: string) {
    if (field === 'tipo') setRequestedInvoiceId('')
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  async function chooseBudget(id: string) {
    const option = options.find((item) => item.id === id)
    const request = ++contextRequest.current
    setSelectedBudgetIds(() => id ? [id] : [])
    if (!option || (option.cliente_id === clientId && context.budgets.some((budget) => budget.id === id))) {
      setLoading(false)
      return
    }
    if (option.cliente_id !== clientId) {
      setClientId(option.cliente_id)
      setDeliveryNotes([])
      setRequestedInvoiceId('')
      setNewFiles([])
      setUploading(false)
      finance.reset()
    }
    setLoading(true)
    try {
      const response = await readDocumentContext(option.cliente_id)
      if (request !== contextRequest.current) return
      if (response.ok) {
        setContext(response.datos)
        setMessage('')
      } else {
        setContext(EMPTY_DOCUMENT_CONTEXT)
        setSelectedBudgetIds(() => [])
        setMessage(response.message)
      }
    } catch {
      if (request !== contextRequest.current) return
      setContext(EMPTY_DOCUMENT_CONTEXT)
      setSelectedBudgetIds(() => [])
      setMessage('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.')
    } finally {
      if (request === contextRequest.current) setLoading(false)
    }
  }
  async function changeStatus(instrument: PaymentInstrument, status: PaymentInstrument['status'], settledOn: string | null, reason: string) {
    if (statusSubmitting.current || !document || !finance.version) return
    const showError = (message: string) => setStatusErrors({ [instrument.id]: { message } })
    if (dirty) {
      showError('Guardá los cambios y archivos antes de modificar el estado del cheque.')
      return
    }
    statusSubmitting.current = true
    setStatusPending(true)
    setStatusErrors({})
    try {
      const result = await changeInstrumentStatus({ opId: document.id, instrumentId: instrument.id,
        expectedVersion: finance.version, status, settledOn, correctionReason: reason })
      if (!result.ok) {
        const dateError = result.errors?.settledOn
        if (dateError) setStatusErrors({ [instrument.id]: { settledOn: dateError } })
        else showError(result.message)
        return
      }
      const refreshed = await readDocumentContext(clientId)
      if (!refreshed.ok) { showError('El estado cambió. Volvé a abrir el documento para actualizarlo.'); return }
      const refreshedDocument = refreshed.datos.documentos.find((item) => item.id === document.id)
      const refreshedFinance = refreshed.datos.financeByDocument[document.id]
      if (!refreshedDocument || !refreshedFinance || refreshedDocument.financial_version !== result.datos.financialVersion) {
        showError('El documento volvió a cambiar. Volvé a abrirlo antes de continuar.')
        return
      }
      setContext(refreshed.datos)
      finance.synchronize(refreshedFinance, result.datos.financialVersion, refreshedDocument.payment_condition ?? '')
    } catch {
      showError('No se pudo confirmar el estado. Volvé a abrir el documento antes de reintentar.')
    } finally {
      statusSubmitting.current = false
      setStatusPending(false)
    }
  }
  function save(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current || statusSubmitting.current || uploading || loading || !contextReady) return
    if (finance.replacedInstruments.size && !finance.reason.trim()) {
      const error = 'Indicá el motivo del reemplazo del cheque antes de guardar.'
      setMessage(error)
      setErrors({ 'finance.correctionReason': error })
      globalThis.document.getElementById('financial-reason')?.focus()
      return
    }
    if (values.tipo === 'remito' && equipment.ambiguous) {
      setMessage(AMBIGUOUS_EQUIPMENT_MESSAGE)
      return
    }
    submitting.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const invoiceTotal = parseAmountCents(values.monto)
        const defaultInvoiceAllocation = !document && assignInvoiceTotal && invoiceBudget &&
          !finance.snapshot.invoiceAllocations.length && invoiceTotal !== null && invoiceTotal > BigInt(0)
          ? {
              budgetId: invoiceBudget.id,
              equipmentId: invoiceBudget.equipmentId,
              equipmentStatus: invoiceBudget.equipmentId ? 'assigned' as const : 'unknown' as const,
              amount: values.monto,
              historicalSettledAmount: '0',
            }
          : undefined
        const replaceDeliveryNotes = values.tipo === 'factura' &&
          (document?.tipo !== 'factura' || !sameIds(deliveryNotes, originalDeliveryNotes))
        const result = await saveDocument({
          id: document?.id,
          clientId,
          budgets: selectedBudgetIds,
          datos: { ...values, equipo_id: values.tipo === 'remito' ? equipment.id ?? '' : '' },
          archivos: newFiles,
          quitar: remove,
          ...(replaceDeliveryNotes ? { remitos: deliveryNotes } : {}),
          ...(selectedInvoiceId ? { linkedInvoiceId: selectedInvoiceId } : {}),
          ...(values.tipo === 'orden_pago' || values.tipo === 'factura'
            ? { finance: finance.input(values.tipo, values.monto, defaultInvoiceAllocation), ...(values.tipo === 'orden_pago' ? { paymentCondition: finance.condition } : {}) }
            : { aplicaciones: [] }),
          cotizacion: quote,
        })
        if (!result.ok) {
          setMessage(result.message)
          setErrors(result.errors ?? {})
          return
        }
        router.push(result.datos.presupuesto ? `/presupuestos/${result.datos.presupuesto}` : '/presupuestos')
        router.refresh()
      } catch {
        setMessage('No se pudo guardar. Tus datos y archivos siguen acá para reintentar.')
      } finally {
        submitting.current = false
      }
    })
  }
  return {
    pending,
    equipment,
    equipmentLabel,
    contextReady,
    context,
    selectedBudgetIds,
    setSelectedBudgetIds,
    clientId,
    loading,
    values,
    deliveryNotes,
    setDeliveryNotes,
    linkedInvoice,
    selectableInvoices,
    selectedInvoiceId,
    setRequestedInvoiceId,
    invoiceBudget,
    assignInvoiceTotal,
    setAssignInvoiceTotal,
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
  }
}

export type DocumentFormState = ReturnType<typeof useDocumentForm>
