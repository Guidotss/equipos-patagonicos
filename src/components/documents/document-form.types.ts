import type { DocumentType } from '@/lib/documents/schemas'
import type { DocumentContext, Document, FileDocument, OptionBudget } from '@/lib/documents/screens'

export type DocumentFormProps = {
  options: OptionBudget[]
  budgetId?: string
  initialContext?: DocumentContext
  type?: DocumentType
  document?: Document
  filesExisting?: FileDocument[]
  linkedBudgetIds?: string[]
  initialAllocations?: { factura_id: string; monto_aplicado: number }[]
  deliveryNoteId?: string
  invoiceId?: string
  quote?: { id: string; version: string }
}
