import type { Document, DocumentContext } from '@/lib/documents/screens'
import { parseDecimalCents, sumCents } from './amounts'

/** Documentos vinculados que contienen importes monetarios todavía sin atribuir. */
export function unresolvedDocuments(
  documents: Document[],
  context: DocumentContext,
): Document[] {
  const linkedIds = new Set(documents.map((document) => document.id))
  const unresolvedIds = new Set<string>()
  for (const document of context.documentos) {
    const finance = context.financeByDocument[document.id]
    if (!finance) continue
    if (
      document.tipo === 'factura' &&
      document.tipo_comprobante !== 'NC' &&
      linkedIds.has(document.id) &&
      finance.invoiceAllocations.some(
        (allocation) =>
          allocation.budgetId === null &&
          (!document.deleted_at ||
            parseDecimalCents(allocation.historicalSettledAmount)! > BigInt(0)),
      )
    ) {
      unresolvedIds.add(document.id)
    }
    if (document.tipo !== 'orden_pago' || document.deleted_at) continue
    for (const instrument of finance.paymentInstruments) {
      if (instrument.status === 'voided' || instrument.status === 'rejected')
        continue
      const allocations = finance.paymentAllocations.filter(
        (allocation) => allocation.instrumentId === instrument.id,
      )
      if (
        linkedIds.has(document.id) &&
        sumCents(
          allocations.map((allocation) =>
            parseDecimalCents(allocation.amount)!,
          ),
        ) < parseDecimalCents(instrument.amount)!
      )
        unresolvedIds.add(document.id)
      for (const allocation of allocations) {
        if (
          allocation.budgetId !== null ||
          instrument.status === 'legacy_unclassified'
        )
          continue
        if (linkedIds.has(document.id)) unresolvedIds.add(document.id)
        if (allocation.invoiceId && linkedIds.has(allocation.invoiceId))
          unresolvedIds.add(allocation.invoiceId)
      }
    }
  }
  return documents.filter((document) => unresolvedIds.has(document.id))
}
