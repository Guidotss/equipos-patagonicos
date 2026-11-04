'use client'

import { readDocumentContext, saveDocument } from '@/app/(app)/documentos/actions'
import { AMBIGUOUS_EQUIPMENT_MESSAGE, deliveryNoteEquipment, hasSelectedBudgetContext } from '@/lib/documents/equipment'
import type { UploadedFile } from '@/lib/documents/service'
import { formatAmountTable, parsePrice } from '@/lib/format/amounts'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, useTransition } from 'react'

import {
  EMPTY_DOCUMENT_CONTEXT,
  initialAllocations,
  initialDeliveryNotes,
  initialDocumentValues,
  type DocumentFormValues,
} from './document-form-model'
import type { DocumentFormProps } from './document-form.types'

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
  const [selectedBudgetIds, setSelectedBudgetIds] = useState(
    linkedBudgetIds.length ? linkedBudgetIds : budgetId ? [budgetId] : [],
  )
  const [clientId, setClientId] = useState(
    document?.cliente_id ?? options.find((option) => option.id === budgetId)?.cliente_id ?? '',
  )
  const [loading, setLoading] = useState(false)
  const contextRequest = useRef(0)
  const [values, setValues] = useState(() => initialDocumentValues(props))
  const [deliveryNotes, setDeliveryNotes] = useState(() => initialDeliveryNotes(props))
  const [allocations, setAllocations] = useState(() => initialAllocations(props))
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [remove, setRemovedFileIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const contextReady = Boolean(quote) || hasSelectedBudgetContext(context, selectedBudgetIds)
  const equipment = deliveryNoteEquipment(context, selectedBudgetIds, document)
  const equipmentLabel = contextReady
    ? equipment.ambiguous ? 'Equipos diferentes' : equipment.name
    : loading ? 'Cargando equipo…' : selectedBudgetIds.length ? 'Volvé a seleccionar el presupuesto' : 'Seleccioná un presupuesto'
  const onChangeFiles = useCallback((files: UploadedFile[], pendingList: boolean) => {
    setNewFiles(files)
    setUploading(pendingList)
  }, [])
  const changeField = (field: keyof DocumentFormValues, value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  async function chooseBudget(id: string) {
    const option = options.find((item) => item.id === id)
    setSelectedBudgetIds(id ? [id] : [])
    if (!option || (option.cliente_id === clientId && context.budgets.some((budget) => budget.id === id))) return
    if (option.cliente_id !== clientId) {
      setClientId(option.cliente_id)
      setDeliveryNotes([])
      setAllocations({})
      setNewFiles([])
      setUploading(false)
    }
    const request = ++contextRequest.current
    setLoading(true)
    try {
      const response = await readDocumentContext(option.cliente_id)
      if (request !== contextRequest.current) return
      if (response.ok) {
        setContext(response.datos)
        setMessage('')
      } else {
        setContext(EMPTY_DOCUMENT_CONTEXT)
        setSelectedBudgetIds([])
        setMessage(response.message)
      }
    } catch {
      if (request !== contextRequest.current) return
      setContext(EMPTY_DOCUMENT_CONTEXT)
      setSelectedBudgetIds([])
      setMessage('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.')
    } finally {
      if (request === contextRequest.current) setLoading(false)
    }
  }
  function changeAllocation(id: string, value: string | null) {
    const next = { ...allocations }
    if (value === null) delete next[id]
    else next[id] = value
    setAllocations(next)
    const total = Object.values(next).reduce((sum, amount) => sum + (parsePrice(amount) ?? 0), 0)
    changeField('monto', total ? formatAmountTable(total) : '')
  }
  function save(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current || uploading || loading || !contextReady) return
    if (values.tipo === 'remito' && equipment.ambiguous) {
      setMessage(AMBIGUOUS_EQUIPMENT_MESSAGE)
      return
    }
    submitting.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const result = await saveDocument({
          id: document?.id,
          clientId,
          budgets: selectedBudgetIds,
          datos: { ...values, equipo_id: values.tipo === 'remito' ? equipment.id ?? '' : '' },
          archivos: newFiles,
          quitar: remove,
          remitos: values.tipo === 'factura' ? deliveryNotes : [],
          aplicaciones:
            values.tipo === 'orden_pago'
              ? Object.entries(allocations).map(([invoiceId, allocatedAmount]) => ({
                  factura_id: invoiceId,
                  monto_aplicado: allocatedAmount,
                }))
              : [],
          cotizacion: quote,
        })
        if (!result.ok) {
          setMessage(result.message)
          setErrors(result.errors ?? {})
          return
        }
        router.push(`/presupuestos/${result.datos.presupuesto}`)
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
  }
}

export type DocumentFormState = ReturnType<typeof useDocumentForm>
