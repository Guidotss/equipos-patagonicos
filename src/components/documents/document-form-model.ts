import { FIELDS_DOCUMENT } from '@/lib/documents/schemas'
import type { ContextoDocument, Document, OptionBudget } from '@/lib/documents/screens'
import { formatAmountTable } from '@/lib/format/amounts'

import type { DocumentFormProps } from './document-form.types'

export type DocumentFormValues = Record<(typeof FIELDS_DOCUMENT)[number], string>
export const EMPTY_DOCUMENT_CONTEXT: ContextoDocument = { budgets: [], documentos: [], facturas: [], equipos: [] }
const normalizeNumber = (numero: string) =>
  numero
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')

export function initialDocumentValues({
  document,
  tipo = 'remito',
  contextoInitial = EMPTY_DOCUMENT_CONTEXT,
  invoiceId,
}: DocumentFormProps): DocumentFormValues {
  const initial = Object.fromEntries(
    FIELDS_DOCUMENT.map((field) => [field, document?.[field] == null ? '' : String(document[field])]),
  ) as DocumentFormValues
  initial.tipo = document?.tipo ?? tipo
  initial.tipo_comprobante = document?.tipo_comprobante ?? 'FA'
  const invoice = contextoInitial.facturas.find((item) => item.id === invoiceId)
  if (invoice?.saldo) initial.monto = formatAmountTable(invoice.saldo)
  else if (document?.monto) initial.monto = formatAmountTable(document.monto)
  return initial
}

export function initialDeliveryNotes({
  document,
  contextoInitial = EMPTY_DOCUMENT_CONTEXT,
  deliveryNoteId,
}: DocumentFormProps): string[] {
  return document
    ? contextoInitial.documentos.filter((item) => item.factura_id === document.id).map((item) => item.id)
    : deliveryNoteId
      ? [deliveryNoteId]
      : []
}

export function initialAllocations({
  document,
  contextoInitial = EMPTY_DOCUMENT_CONTEXT,
  aplicacionesIniciales = [],
  invoiceId,
}: DocumentFormProps): Record<string, string> {
  if (document)
    return Object.fromEntries(
      aplicacionesIniciales.map((item) => [item.factura_id, formatAmountTable(item.monto_aplicado)]),
    )
  const invoice = contextoInitial.facturas.find((item) => item.id === invoiceId)
  return invoice?.id && invoice.saldo ? { [invoice.id]: formatAmountTable(invoice.saldo) } : {}
}

export function documentFormSelections({
  values,
  contexto,
  seleccionados,
  remitos,
  aplicaciones,
  options,
  searchBudget,
  document,
}: {
  values: DocumentFormValues
  contexto: ContextoDocument
  seleccionados: string[]
  remitos: string[]
  aplicaciones: Record<string, string>
  options: OptionBudget[]
  searchBudget: string
  document?: Document
}) {
  const duplicado =
    values.numero &&
    contexto.documentos.some(
      (item) =>
        item.id !== document?.id &&
        !item.deleted_at &&
        item.tipo === values.tipo &&
        normalizeNumber(item.numero) === normalizeNumber(values.numero),
    )
  const budgetsClient = contexto.budgets.filter(
    (item) => item.presupuesto_estado !== 'anulado' || seleccionados.includes(item.id),
  )
  const invoicesActivas = new Set(contexto.facturas.map((item) => item.id))
  const deliveryNotesDisponibles = contexto.documentos.filter(
    (item) =>
      item.tipo === 'remito' &&
      (remitos.includes(item.id) ||
        (!item.deleted_at &&
          (!item.factura_id || item.factura_id === document?.id || !invoicesActivas.has(item.factura_id)))),
  )
  const invoicesAnuladas = contexto.documentos.filter(
    (item) => item.tipo === 'factura' && item.deleted_at && aplicaciones[item.id] !== undefined,
  )
  const normalizeSearch = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-AR')
  const optionsVisible = options
    .filter((item) => item.presupuesto_estado !== 'anulado')
    .filter(
      (item) =>
        item.id === seleccionados[0] ||
        normalizeSearch(`${item.numero} ${item.cliente_razon_social} ${item.asunto}`).includes(
          normalizeSearch(searchBudget),
        ),
    )
    .toSorted(
      (a, b) =>
        Number(b.presupuesto_estado === 'en_curso') - Number(a.presupuesto_estado === 'en_curso') ||
        b.numero - a.numero,
    )
  return { duplicado, budgetsClient, deliveryNotesDisponibles, invoicesAnuladas, optionsVisible }
}

export const changeList = (list: string[], id: string, checked: boolean) =>
  checked ? [...list, id] : list.filter((item) => item !== id)
