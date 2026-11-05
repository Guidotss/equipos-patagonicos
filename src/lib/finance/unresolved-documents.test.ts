import { describe, expect, it } from 'vitest'
import type { Document, DocumentContext } from '@/lib/documents/screens'
import { unresolvedDocuments } from './unresolved-documents'

describe('unresolvedDocuments', () => {
  it('señala solo documentos vinculados con importes sin atribuir, no equipos desconocidos', () => {
    const documents = [
      { id: 'known', tipo: 'factura', tipo_comprobante: 'FA', deleted_at: null },
      { id: 'unknown', tipo: 'factura', tipo_comprobante: 'FA', deleted_at: null },
      { id: 'payment', tipo: 'orden_pago', deleted_at: null },
    ] as Document[]
    const base = { equipmentId: null, equipmentStatus: 'unknown', amount: '100.00', historicalSettledAmount: '0.00' }
    const context = {
      documentos: documents,
      financeByDocument: {
        known: { invoiceAllocations: [{ ...base, budgetId: 'budget' }], paymentInstruments: [], paymentAllocations: [] },
        unknown: { invoiceAllocations: [{ ...base, budgetId: null }], paymentInstruments: [], paymentAllocations: [] },
        payment: { invoiceAllocations: [], paymentInstruments: [{ id: 'check', status: 'pending', amount: '100.00' }], paymentAllocations: [{ instrumentId: 'check', budgetId: 'budget', invoiceId: 'known', amount: '50.00' }] },
      },
    } as unknown as DocumentContext
    expect(unresolvedDocuments(documents, context).map((document) => document.id)).toEqual(['unknown', 'payment'])
  })
})
