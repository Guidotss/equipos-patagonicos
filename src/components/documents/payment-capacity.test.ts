import { describe, expect, it } from 'vitest'
import type { DocumentContext } from '@/lib/documents/screens'
import type {
  DocumentFinance,
  PaymentAllocation,
  PaymentInstrument,
} from '@/lib/finance/contracts'
import { paymentInvoiceCapacity } from './payment-capacity'

const instrument: PaymentInstrument = {
  id: 'own',
  kind: 'cash',
  status: 'confirmed',
  amount: '100.01',
  receivedOn: null,
  dueOn: null,
  settledOn: '2024-06-20',
  reference: '',
  bank: '',
}
const allocation: PaymentAllocation = {
  id: 'allocation',
  instrumentId: 'own',
  invoiceId: 'invoice',
  budgetId: 'work',
  amount: '100.01',
}
const finance: DocumentFinance = {
  invoiceAllocations: [],
  paymentInstruments: [instrument],
  paymentAllocations: [allocation],
}
const context = {
  facturas: [{ id: 'invoice', exact_available: '0.00' }],
  documentos: [
    { id: 'invoice', tipo: 'factura', deleted_at: null },
    { id: 'op', tipo: 'orden_pago', deleted_at: null },
  ],
  financeByDocument: {
    invoice: {
      invoiceAllocations: [
        { budgetId: 'work', amount: '100.01', historicalSettledAmount: '0' },
      ],
    },
    op: finance,
  },
} as unknown as DocumentContext

describe('capacidad de factura al editar una OP', () => {
  it('devuelve la reserva propia al deseleccionar una factura totalmente cubierta', () => {
    const row = { ...allocation, invoiceId: null }
    const capacity = paymentInvoiceCapacity(context, new Set(['own']), {
      ...finance,
      paymentAllocations: [row],
    })
    expect(capacity('invoice', row)).toBe(BigInt(10001))
  })

  it('descuenta las otras filas del borrador una sola vez y mantiene centavos exactos', () => {
    const row = { ...allocation, amount: '60,00' }
    const second = {
      ...allocation,
      id: 'second',
      instrumentId: 'new',
      amount: '40,01',
    }
    const draft = {
      ...finance,
      paymentInstruments: [instrument, { ...instrument, id: 'new' }],
      paymentAllocations: [row, second],
    }
    const capacity = paymentInvoiceCapacity(context, new Set(['own']), draft)
    expect(capacity('invoice', row)).toBe(BigInt(6000))
    expect(capacity('invoice', { ...second, invoiceId: null })).toBe(BigInt(0))
    expect(capacity('invoice', second)).toBe(BigInt(4001))
  })

  it('respeta reservas ajenas, cancelación histórica y el límite global entre trabajos', () => {
    const other = {
      ...instrument,
      id: 'other',
      status: 'pending' as const,
      kind: 'check' as const,
    }
    const shared = {
      ...context,
      facturas: [{ id: 'invoice', exact_available: '10.00' }],
      documentos: [
        ...context.documentos,
        { id: 'other-op', tipo: 'orden_pago', deleted_at: null },
      ],
      financeByDocument: {
        ...context.financeByDocument,
        invoice: {
          invoiceAllocations: [
            {
              budgetId: 'work',
              amount: '100.01',
              historicalSettledAmount: '20.00',
            },
            {
              budgetId: 'other-work',
              amount: '100.00',
              historicalSettledAmount: '0',
            },
          ],
        },
        'other-op': {
          paymentInstruments: [other],
          paymentAllocations: [
            { ...allocation, instrumentId: 'other', amount: '30.00' },
          ],
        },
      },
    } as unknown as DocumentContext
    const row = { ...allocation, invoiceId: null }
    const capacity = paymentInvoiceCapacity(shared, new Set(['own']), {
      ...finance,
      paymentAllocations: [],
    })
    expect(capacity('invoice', row)).toBe(BigInt(5001))
    expect(capacity('invoice', { ...row, budgetId: 'other-work' })).toBe(
      BigInt(10000),
    )
    const freshCapacity = paymentInvoiceCapacity(shared, new Set(), {
      ...finance,
      paymentAllocations: [],
    })
    expect(freshCapacity('invoice', { ...row, budgetId: 'other-work' })).toBe(
      BigInt(1000),
    )
  })
})
