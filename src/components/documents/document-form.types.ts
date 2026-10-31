import type { TipoDocument } from '@/lib/documents/schemas'
import type { ContextoDocument, Document, FileDocument, OptionBudget } from '@/lib/documents/screens'

export type DocumentFormProps = {
  options: OptionBudget[]
  budgetId?: string
  contextoInitial?: ContextoDocument
  tipo?: TipoDocument
  document?: Document
  filesExisting?: FileDocument[]
  vinculos?: string[]
  aplicacionesIniciales?: { factura_id: string; monto_aplicado: number }[]
  deliveryNoteId?: string
  invoiceId?: string
  cotizacion?: { id: string; version: string }
}
