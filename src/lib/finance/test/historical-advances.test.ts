import { describe, expect, it } from 'vitest'
import type { DocumentContext } from '@/lib/documents/screens'
import { historicalAdvances } from '.././historical-advances'

describe('anticipos históricos', () => {
  it('identifica el comprobante anulado por su parte histórica del trabajo', () => {
    const context = {
      documentos: [
        {
          id: 'invoice',
          tipo: 'factura',
          tipo_comprobante: 'FA',
          deleted_at: '2026-01-01',
        },
        {
          id: 'active',
          tipo: 'factura',
          tipo_comprobante: 'FA',
          deleted_at: null,
        },
      ],
      financeByDocument: {
        invoice: {
          invoiceAllocations: [
            { budgetId: 'work', historicalSettledAmount: '12.34' },
            { budgetId: 'other', historicalSettledAmount: '5.00' },
            { budgetId: 'work', historicalSettledAmount: '2.01' },
          ],
        },
      },
    } as unknown as DocumentContext
    expect(historicalAdvances(context, 'work')).toEqual([
      { document: context.documentos[0], amount: '14.35' },
    ])
  })
})
