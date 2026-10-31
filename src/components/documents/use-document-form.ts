'use client'

import { readContextoDocument, saveDocument } from '@/app/(app)/documentos/actions'
import type { FileSubido } from '@/lib/documents/service'
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
    contextoInitial = EMPTY_DOCUMENT_CONTEXT,
    document,
    vinculos = [],
    cotizacion: quote,
  } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const enviando = useRef(false)
  const [contexto, setContexto] = useState(contextoInitial)
  const [seleccionados, setSeleccionados] = useState(vinculos.length ? vinculos : budgetId ? [budgetId] : [])
  const [clientId, setClientId] = useState(
    document?.cliente_id ?? options.find((option) => option.id === budgetId)?.cliente_id ?? '',
  )
  const [cargando, setCargando] = useState(false)
  const [searchBudget, setSearchBudget] = useState('')
  const requestContexto = useRef(0)
  const [values, setValues] = useState(() => initialDocumentValues(props))
  const [remitos, setDeliveryNotes] = useState(() => initialDeliveryNotes(props))
  const [aplicaciones, setAplicaciones] = useState(() => initialAllocations(props))
  const [nuevos, setNew] = useState<FileSubido[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [quitar, setQuitar] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const onChangeFiles = useCallback((archivos: FileSubido[], pendingList: boolean) => {
    setNew(archivos)
    setSubiendo(pendingList)
  }, [])
  const changeField = (field: keyof DocumentFormValues, value: string) =>
    setValues((anteriores) => ({ ...anteriores, [field]: value }))

  async function chooseBudget(id: string) {
    const option = options.find((item) => item.id === id)
    setSeleccionados(id ? [id] : [])
    if (!option || option.cliente_id === clientId) return
    setClientId(option.cliente_id)
    setDeliveryNotes([])
    setAplicaciones({})
    setNew([])
    setSubiendo(false)
    const request = ++requestContexto.current
    setCargando(true)
    try {
      const response = await readContextoDocument(option.cliente_id)
      if (request !== requestContexto.current) return
      if (response.ok) {
        setContexto(response.datos)
        setMessage('')
      } else {
        setContexto(EMPTY_DOCUMENT_CONTEXT)
        setMessage(response.message)
      }
    } catch {
      setMessage('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.')
    } finally {
      if (request === requestContexto.current) setCargando(false)
    }
  }
  function changeAplicacion(id: string, value: string | null) {
    const next = { ...aplicaciones }
    if (value === null) delete next[id]
    else next[id] = value
    setAplicaciones(next)
    const total = Object.values(next).reduce((sum, monto) => sum + (parsePrice(monto) ?? 0), 0)
    changeField('monto', total ? formatAmountTable(total) : '')
  }
  function save(evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando.current || subiendo || cargando) return
    enviando.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const result = await saveDocument({
          id: document?.id,
          clientId,
          budgets: seleccionados,
          datos: values,
          archivos: nuevos,
          quitar,
          remitos: values.tipo === 'factura' ? remitos : [],
          aplicaciones:
            values.tipo === 'orden_pago'
              ? Object.entries(aplicaciones).map(([factura_id, monto_aplicado]) => ({ factura_id, monto_aplicado }))
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
        enviando.current = false
      }
    })
  }
  return {
    pending,
    contexto,
    seleccionados,
    setSeleccionados,
    clientId,
    cargando,
    searchBudget,
    setSearchBudget,
    values,
    remitos,
    setDeliveryNotes,
    aplicaciones,
    quitar,
    setQuitar,
    subiendo,
    message,
    errors,
    onChangeFiles,
    changeField,
    chooseBudget,
    changeAplicacion,
    save,
  }
}

export type DocumentFormState = ReturnType<typeof useDocumentForm>
