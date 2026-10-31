import { FIELDS_DOCUMENT } from '@/lib/documents/schemas'
import type { DocumentContext, Document, OptionBudget } from '@/lib/documents/screens'
import { formatAmountTable } from '@/lib/format/amounts'

import type { DocumentFormProps } from './document-form.types'

export type DocumentFormValues = Record<(typeof FIELDS_DOCUMENT)[number], string>
export const EMPTY_DOCUMENT_CONTEXT: DocumentContext = { budgets: [], documentos: [], facturas: [], equipos: [] }
const normalizeNumber = (number: string) =>
  number
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')

export function initialDocumentValues({
  document,
  type = 'remito',
  initialContext = EMPTY_DOCUMENT_CONTEXT,
  invoiceId,
}: DocumentFormProps): DocumentFormValues {
  const initial = Object.fromEntries(
    FIELDS_DOCUMENT.map((field) => [field, document?.[field] == null ? '' : String(document[field])]),
  ) as DocumentFormValues
  initial.tipo = document?.tipo ?? type
  initial.tipo_comprobante = document?.tipo_comprobante ?? 'FA'
  const invoice = initialContext.facturas.find((item) => item.id === invoiceId)
  if (invoice?.saldo) initial.monto = formatAmountTable(invoice.saldo)
  else if (document?.monto) initial.monto = formatAmountTable(document.monto)
  return initial
}

export function initialDeliveryNotes({
  document,
  initialContext = EMPTY_DOCUMENT_CONTEXT,
  deliveryNoteId,
}: DocumentFormProps): string[] {
  return document
    ? initialContext.documentos.filter((item) => item.factura_id === document.id).map((item) => item.id)
    : deliveryNoteId
      ? [deliveryNoteId]
      : []
}

export function initialAllocations({
  document,
  initialContext = EMPTY_DOCUMENT_CONTEXT,
  initialAllocations = [],
  invoiceId,
}: DocumentFormProps): Record<string, string> {
  if (document)
    return Object.fromEntries(
      initialAllocations.map((item) => [item.factura_id, formatAmountTable(item.monto_aplicado)]),
    )
  const invoice = initialContext.facturas.find((item) => item.id === invoiceId)
  return invoice?.id && invoice.saldo ? { [invoice.id]: formatAmountTable(invoice.saldo) } : {}
}

export function documentFormSelections({
  values,
  context,
  selectedBudgetIds,
  deliveryNotes,
  allocations,
  options,
  searchBudget,
  document,
}: {
  values: DocumentFormValues
  context: DocumentContext
  selectedBudgetIds: string[]
  deliveryNotes: string[]
  allocations: Record<string, string>
  options: OptionBudget[]
  searchBudget: string
  document?: Document
}) {
  const duplicate =
    values.numero &&
    context.documentos.some(
      (item) =>
        item.id !== document?.id &&
        !item.deleted_at &&
        item.tipo === values.tipo &&
        normalizeNumber(item.numero) === normalizeNumber(values.numero),
    )
  const clientBudgets = context.budgets.filter(
    (item) => item.presupuesto_estado !== 'anulado' || selectedBudgetIds.includes(item.id),
  )
  const activeInvoices = new Set(context.facturas.map((item) => item.id))
  const availableDeliveryNotes = context.documentos.filter(
    (item) =>
      item.tipo === 'remito' &&
      (deliveryNotes.includes(item.id) ||
        (!item.deleted_at &&
          (!item.factura_id || item.factura_id === document?.id || !activeInvoices.has(item.factura_id)))),
  )
  const voidedInvoices = context.documentos.filter(
    (item) => item.tipo === 'factura' && item.deleted_at && allocations[item.id] !== undefined,
  )
  const normalizeSearch = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-AR')
  const visibleOptions = options
    .filter((item) => item.presupuesto_estado !== 'anulado')
    .filter(
      (item) =>
        item.id === selectedBudgetIds[0] ||
        normalizeSearch(`${item.numero} ${item.cliente_razon_social} ${item.asunto}`).includes(
          normalizeSearch(searchBudget),
        ),
    )
    .toSorted(
      (a, b) =>
        Number(b.presupuesto_estado === 'en_curso') - Number(a.presupuesto_estado === 'en_curso') ||
        b.numero - a.numero,
    )
  return { duplicate, clientBudgets, availableDeliveryNotes, voidedInvoices, visibleOptions }
}

export const changeList = (list: string[], id: string, checked: boolean) =>
  checked ? [...list, id] : list.filter((item) => item !== id)
