import { z } from 'zod'
import { isDate } from '@/lib/format/dates'
import { todayArgentina } from '@/lib/format/dates'
import { parseDecimalCents } from './amounts'

export const decimalAmountSchema = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    'Importe inválido: hasta 12 enteros y 2 decimales',
  )
export const positiveAmountSchema = decimalAmountSchema.refine((value) => {
  const cents = parseDecimalCents(value)
  return cents !== null && cents > BigInt(0)
}, 'El importe debe ser positivo')
const nullableDate = z.string().refine(isDate, 'Fecha inválida').nullable()
const versionSchema = z.number().int().positive().max(999_999_999_999_999)
const reasonSchema = z
  .string()
  .trim()
  .max(2000, 'El motivo puede tener hasta 2000 caracteres')

export const invoiceAllocationSchema = z
  .object({
    id: z.uuid().optional(),
    budgetId: z.uuid().nullable(),
    equipmentId: z.uuid().nullable(),
    equipmentStatus: z.enum(['assigned', 'none', 'unknown']),
    amount: positiveAmountSchema,
    historicalSettledAmount: decimalAmountSchema,
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      (entry.equipmentStatus === 'assigned') !== (entry.equipmentId !== null) ||
      (entry.budgetId === null && entry.equipmentStatus !== 'unknown')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['equipmentStatus'],
        message: 'Indicá un equipo asignado, sin equipo o desconocido válido',
      })
    }
    const historical = parseDecimalCents(entry.historicalSettledAmount)
    const amount = parseDecimalCents(entry.amount)
    if (historical !== null && amount !== null && historical > amount) {
      ctx.addIssue({
        code: 'custom',
        path: ['historicalSettledAmount'],
        message: 'El cobro histórico no puede superar la parte facturada',
      })
    }
  })

export const paymentKindSchema = z.enum([
  'cash',
  'transfer',
  'check',
  'withholding',
  'legacy_unidentified',
])
export const paymentStatusSchema = z.enum([
  'confirmed',
  'pending',
  'cleared',
  'rejected',
  'voided',
  'legacy_recognized',
  'legacy_unclassified',
])

function validateSettlement(
  status: string,
  settledOn: string | null,
  ctx: z.RefinementCtx,
) {
  if (
    (['confirmed', 'cleared'].includes(status) && settledOn === null) ||
    ([
      'pending',
      'rejected',
      'legacy_recognized',
      'legacy_unclassified',
    ].includes(status) &&
      settledOn !== null) ||
    (settledOn !== null && settledOn > todayArgentina())
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['settledOn'],
      message: 'Indicá una fecha efectiva de cobro válida, que no sea futura',
    })
  }
}

export const paymentInstrumentSchema = z
  .object({
    id: z.uuid(),
    kind: paymentKindSchema,
    status: paymentStatusSchema,
    amount: positiveAmountSchema,
    receivedOn: nullableDate,
    dueOn: nullableDate,
    settledOn: nullableDate,
    reference: z.string().max(200, 'Máximo 200 caracteres'),
    bank: z.string().max(200, 'Máximo 200 caracteres'),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const valid =
      entry.kind === 'check'
        ? ['pending', 'cleared', 'rejected', 'voided']
        : entry.kind === 'legacy_unidentified'
          ? ['legacy_recognized', 'legacy_unclassified', 'voided']
          : ['confirmed', 'voided']
    if (!valid.includes(entry.status))
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'El estado no corresponde al medio de pago',
      })
    validateSettlement(entry.status, entry.settledOn, ctx)
    if (
      entry.kind === 'legacy_unidentified' &&
      [entry.receivedOn, entry.dueOn, entry.settledOn].some(
        (date) => date !== null,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['receivedOn'],
        message: 'El medio heredado sin identificar no acredita fechas',
      })
    }
  })

export const paymentAllocationSchema = z
  .object({
    id: z.uuid().optional(),
    instrumentId: z.uuid(),
    budgetId: z.uuid().nullable(),
    invoiceId: z.uuid().nullable(),
    amount: positiveAmountSchema,
  })
  .strict()

function uniqueIds(
  entries: { id?: string }[],
  path: string,
  ctx: z.RefinementCtx,
) {
  const ids = entries.flatMap((entry) => (entry.id ? [entry.id] : []))
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: 'Hay identificadores repetidos',
    })
}

export const schemaFinance = z
  .object({
    expectedVersion: versionSchema.optional(),
    correctionReason: reasonSchema.optional(),
    invoiceAllocations: z.array(invoiceAllocationSchema).max(200).optional(),
    paymentInstruments: z.array(paymentInstrumentSchema).max(200).optional(),
    paymentAllocations: z.array(paymentAllocationSchema).max(200).optional(),
  })
  .strict()
  .superRefine((finance, ctx) => {
    uniqueIds(finance.invoiceAllocations ?? [], 'invoiceAllocations', ctx)
    uniqueIds(finance.paymentInstruments ?? [], 'paymentInstruments', ctx)
    uniqueIds(finance.paymentAllocations ?? [], 'paymentAllocations', ctx)
  })

export const paymentStatusActionSchema = z
  .object({
    opId: z.uuid(),
    instrumentId: z.uuid(),
    expectedVersion: versionSchema,
    status: paymentStatusSchema,
    settledOn: nullableDate,
    correctionReason: reasonSchema.default(''),
  })
  .strict()
  .superRefine((entry, ctx) =>
    validateSettlement(entry.status, entry.settledOn, ctx),
  )

export const documentLifecycleSchema = z
  .object({
    id: z.uuid(),
    restore: z.boolean(),
    expectedVersion: versionSchema.optional(),
    correctionReason: reasonSchema.default(''),
  })
  .strict()
