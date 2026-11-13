import type { z } from 'zod'
import type {
  documentLifecycleSchema,
  invoiceAllocationSchema,
  paymentAllocationSchema,
  paymentInstrumentSchema,
  paymentStatusActionSchema,
  schemaFinance,
} from './schemas'

export type FinanceInput = z.infer<typeof schemaFinance>
export type InvoiceAllocation = z.infer<typeof invoiceAllocationSchema>
export type PaymentInstrument = z.infer<typeof paymentInstrumentSchema>
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>
export type PaymentStatusAction = z.infer<typeof paymentStatusActionSchema>
export type DocumentLifecycleAction = z.infer<typeof documentLifecycleSchema>

/** Datos para inicializar una edición; los importes cruzan JSON como decimales exactos. */
export type DocumentFinance = {
  invoiceAllocations: InvoiceAllocation[]
  paymentInstruments: PaymentInstrument[]
  paymentAllocations: PaymentAllocation[]
}
export type FinanceByDocument = Record<string, DocumentFinance>
