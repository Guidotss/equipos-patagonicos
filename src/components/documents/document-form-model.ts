import { FIELDS_DOCUMENT } from '@/lib/documents/schemas'
import type {
  DocumentContext,
  Document,
  OptionBudget,
} from '@/lib/documents/screens'
import { formatAmountTable } from '@/lib/format/amounts'
import {
  centsToDecimal,
  formatFinancialAmount,
  parseDecimalCents,
  sumCents,
} from '@/lib/finance/amounts'

import type { DocumentFormProps } from './document-form.types'

export type DocumentFormValues = Record<
  (typeof FIELDS_DOCUMENT)[number],
  string
>
export const EMPTY_DOCUMENT_CONTEXT: DocumentContext = {
  budgets: [],
  documentos: [],
  facturas: [],
  invoiceBudgetIds: {},
  equipos: [],
  financeByDocument: {},
}
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
    FIELDS_DOCUMENT.map((field) => [
      field,
      document?.[field] == null ? '' : String(document[field]),
    ]),
  ) as DocumentFormValues
  initial.tipo = document?.tipo ?? type
  initial.tipo_comprobante = document?.tipo_comprobante ?? 'FA'
  const invoice = initialContext.facturas.find((item) => item.id === invoiceId)
  if (
    invoice?.exact_balance &&
    parseDecimalCents(invoice.exact_balance) !== BigInt(0)
  )
    initial.monto = formatFinancialAmount(invoice.exact_balance).slice(2)
  else if (document?.tipo === 'factura') {
    const finance = initialContext.financeByDocument[document.id]
    const rows = finance?.invoiceAllocations
    if (rows?.length)
      initial.monto = formatFinancialAmount(
        centsToDecimal(
          sumCents(
            rows.map((row) => parseDecimalCents(row.amount) ?? BigInt(0)),
          ),
        ),
      ).slice(2)
    else if (document.monto) initial.monto = formatAmountTable(document.monto)
  } else if (document?.monto) initial.monto = formatAmountTable(document.monto)
  return initial
}

export function initialDeliveryNotes({
  document,
  initialContext = EMPTY_DOCUMENT_CONTEXT,
  deliveryNoteId,
}: DocumentFormProps): string[] {
  return document
    ? initialContext.documentos
        .filter((item) => item.factura_id === document.id)
        .map((item) => item.id)
    : deliveryNoteId
      ? [deliveryNoteId]
      : []
}

export function invoiceCoversBudgets(
  context: DocumentContext,
  invoiceId: string,
  budgetIds: string[],
) {
  const invoiceBudgets = context.invoiceBudgetIds[invoiceId] ?? []
  return (
    budgetIds.length > 0 && budgetIds.every((id) => invoiceBudgets.includes(id))
  )
}

export function matchingDeliveryNoteInvoices(
  context: DocumentContext,
  budgetIds: string[],
) {
  return context.facturas.filter(
    (invoice) =>
      invoice.tipo_comprobante !== 'NC' &&
      invoiceCoversBudgets(context, invoice.id, budgetIds),
  )
}

export const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id))

export function documentFormSelections({
  values,
  context,
  selectedBudgetIds,
  deliveryNotes,
  options,
  document,
}: {
  values: DocumentFormValues
  context: DocumentContext
  selectedBudgetIds: string[]
  deliveryNotes: string[]
  options: OptionBudget[]
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
    (item) =>
      item.presupuesto_estado !== 'anulado' ||
      selectedBudgetIds.includes(item.id),
  )
  const activeInvoices = new Set(context.facturas.map((item) => item.id))
  const availableDeliveryNotes = context.documentos.filter(
    (item) =>
      item.tipo === 'remito' &&
      (deliveryNotes.includes(item.id) ||
        (!item.deleted_at &&
          (!item.factura_id ||
            item.factura_id === document?.id ||
            !activeInvoices.has(item.factura_id)))),
  )
  const visibleOptions = options
    .filter((item) => item.presupuesto_estado !== 'anulado')
    .toSorted(
      (a, b) =>
        Number(b.presupuesto_estado === 'en_curso') -
          Number(a.presupuesto_estado === 'en_curso') || b.numero - a.numero,
    )
  return { duplicate, clientBudgets, availableDeliveryNotes, visibleOptions }
}

export const changeList = (list: string[], id: string, checked: boolean) =>
  checked ? [...list, id] : list.filter((item) => item !== id)
