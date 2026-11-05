import { z } from 'zod'
import { isDate } from '@/lib/format/dates'

const decimalString = z.string().regex(/^0*[0-9]{1,12}(\.[0-9]{1,2})?$/, 'Importe inválido')
const positiveDecimalString = decimalString.refine((value) => Number(value) > 0, 'El importe debe ser positivo')
const nullableDate = z.string().refine(isDate, 'Fecha inválida').nullable()

export const schemaFinance = z.object({
  expectedVersion: z.number().int().positive().optional(),
  correctionReason: z.string().max(2000).optional(),
  invoiceAllocations: z.array(z.object({
    id: z.uuid().optional(),
    budgetId: z.uuid().nullable(),
    equipmentId: z.uuid().nullable(),
    equipmentStatus: z.enum(['assigned', 'none', 'unknown']),
    amount: positiveDecimalString,
    historicalSettledAmount: decimalString,
  }).strict()).optional(),
  paymentInstruments: z.array(z.object({
    id: z.uuid(),
    kind: z.enum(['cash', 'transfer', 'check', 'withholding', 'legacy_unidentified']),
    status: z.enum(['confirmed', 'pending', 'cleared', 'rejected', 'voided', 'legacy_recognized', 'legacy_unclassified']),
    amount: positiveDecimalString,
    receivedOn: nullableDate,
    dueOn: nullableDate,
    settledOn: nullableDate,
    reference: z.string().max(200),
    bank: z.string().max(200),
  }).strict()).optional(),
  paymentAllocations: z.array(z.object({
    id: z.uuid().optional(),
    instrumentId: z.uuid(),
    budgetId: z.uuid().nullable(),
    invoiceId: z.uuid().nullable(),
    amount: positiveDecimalString,
  }).strict()).optional(),
}).strict()

export type FinanceInput = z.infer<typeof schemaFinance>
