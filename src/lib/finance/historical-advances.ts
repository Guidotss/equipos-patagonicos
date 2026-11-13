import type { DocumentContext, Document } from '@/lib/documents/screens'
import { centsToDecimal, parseDecimalCents, sumCents } from './amounts'

export type HistoricalAdvance = { document: Document; amount: string }

/** Una factura anulada conserva su cobro histórico sin crear una orden de pago. */
export function historicalAdvances(
  context: DocumentContext,
  budgetId: string,
): HistoricalAdvance[] {
  return context.documentos.flatMap((document) => {
    if (
      document.tipo !== 'factura' ||
      !document.deleted_at ||
      document.tipo_comprobante === 'NC'
    )
      return []
    const rows =
      context.financeByDocument[document.id]?.invoiceAllocations ?? []
    const amount = sumCents(
      rows
        .filter((row) => row.budgetId === budgetId)
        .map(
          (row) => parseDecimalCents(row.historicalSettledAmount) ?? BigInt(0),
        ),
    )
    return amount > BigInt(0)
      ? [{ document, amount: centsToDecimal(amount) }]
      : []
  })
}
