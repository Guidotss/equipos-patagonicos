import type { DocumentContext } from '@/lib/documents/screens'
import type {
  DocumentFinance,
  PaymentAllocation,
  PaymentInstrument,
} from '@/lib/finance/contracts'
import { parseAmountCents, parseDecimalCents } from '@/lib/finance/amounts'

const ZERO = BigInt(0)
const reserves = (instrument: PaymentInstrument) =>
  ['confirmed', 'cleared', 'pending', 'legacy_recognized'].includes(
    instrument.status,
  )
const workKey = (invoiceId: string, budgetId: string) =>
  `${invoiceId}:${budgetId}`

/** Devuelve la reserva propia persistida antes de evaluar el borrador actual. */
export function paymentInvoiceCapacity(
  context: DocumentContext,
  persistedIds: Set<string>,
  draft: DocumentFinance,
) {
  const global = new Map<string, bigint>()
  const work = new Map<string, bigint>()
  const add = (map: Map<string, bigint>, key: string, value: bigint) =>
    map.set(key, (map.get(key) ?? ZERO) + value)
  for (const invoice of context.facturas) {
    if (invoice.id)
      global.set(
        invoice.id,
        parseDecimalCents(invoice.exact_available ?? '0') ?? ZERO,
      )
  }
  for (const document of context.documentos) {
    const entry = context.financeByDocument[document.id]
    if (!entry || document.deleted_at) continue
    if (document.tipo === 'factura')
      for (const row of entry.invoiceAllocations) {
        if (row.budgetId)
          add(
            work,
            workKey(document.id, row.budgetId),
            (parseDecimalCents(row.amount) ?? ZERO) -
              (parseDecimalCents(row.historicalSettledAmount) ?? ZERO),
          )
      }
    if (document.tipo !== 'orden_pago') continue
    const reserved = new Set(
      entry.paymentInstruments.filter(reserves).map((item) => item.id),
    )
    for (const row of entry.paymentAllocations) {
      if (!row.invoiceId || !reserved.has(row.instrumentId)) continue
      const amount = parseDecimalCents(row.amount) ?? ZERO
      if (persistedIds.has(row.instrumentId)) add(global, row.invoiceId, amount)
      else if (row.budgetId)
        add(work, workKey(row.invoiceId, row.budgetId), -amount)
    }
  }
  const draftReserved = new Set(
    draft.paymentInstruments.filter(reserves).map((item) => item.id),
  )
  const allocated = new Map<string, bigint>()
  const allocatedWork = new Map<string, bigint>()
  for (const row of draft.paymentAllocations) {
    if (!row.invoiceId || !draftReserved.has(row.instrumentId)) continue
    const amount = parseAmountCents(row.amount) ?? ZERO
    add(allocated, row.invoiceId, amount)
    if (row.budgetId)
      add(allocatedWork, workKey(row.invoiceId, row.budgetId), amount)
  }
  return (invoiceId: string, row: PaymentAllocation) => {
    if (!row.budgetId) return ZERO
    const own =
      row.invoiceId === invoiceId && draftReserved.has(row.instrumentId)
        ? (parseAmountCents(row.amount) ?? ZERO)
        : ZERO
    const globalRemaining =
      (global.get(invoiceId) ?? ZERO) - (allocated.get(invoiceId) ?? ZERO) + own
    const workRemaining =
      (work.get(workKey(invoiceId, row.budgetId)) ?? ZERO) -
      (allocatedWork.get(workKey(invoiceId, row.budgetId)) ?? ZERO) +
      own
    return globalRemaining < workRemaining ? globalRemaining : workRemaining
  }
}
