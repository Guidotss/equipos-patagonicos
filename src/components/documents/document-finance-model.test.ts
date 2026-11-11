import { describe, expect, it } from 'vitest'
import { financeInput, invoiceDistribution, replaceTerminalCheck } from './document-finance-model'
import type { DocumentFinance, InvoiceAllocation } from '@/lib/finance/contracts'
import type { Document } from '@/lib/documents/screens'
import { EMPTY_DOCUMENT_CONTEXT, initialDocumentValues } from './document-form-model'

const unknown: InvoiceAllocation = {
  id: 'a4efdb81-1985-4b99-896b-f2be9865dc2d', budgetId: null, equipmentId: null,
  equipmentStatus: 'unknown', amount: '100.00', historicalSettledAmount: '40.00',
}

describe('distribución financiera del formulario', () => {
  it.each(['rejected', 'voided'] as const)('reemplaza un cheque %s con ID nuevo y conserva su evidencia y destinos', (status) => {
    const check = { id: 'old', kind: 'check' as const, status, amount: '100.00', receivedOn: '2024-06-10', dueOn: '2024-07-10', settledOn: null, reference: 'CH-1', bank: 'Banco original' }
    const allocation = { id: 'allocation', instrumentId: 'old', budgetId: 'work', invoiceId: 'invoice', amount: '100.00' }
    const result = replaceTerminalCheck({ invoiceAllocations: [], paymentInstruments: [check], paymentAllocations: [allocation] }, 'old', 'cash', 'new')
    expect(result.paymentInstruments[0]).toEqual({ ...check, status: 'voided' })
    expect(result.paymentInstruments[1]).toEqual({ id: 'new', kind: 'cash', status: 'confirmed', amount: status === 'rejected' ? '100.00' : '', receivedOn: null, dueOn: null, settledOn: null, reference: '', bank: '' })
    expect(result.paymentAllocations).toEqual([{ ...allocation, instrumentId: 'new' }])
  })

  it('conserva el importe documental de la OP aunque sus medios tengan otro total', () => {
    const document = { id: 'op', tipo: 'orden_pago', monto: 1234.56 } as Document
    const initialContext = { ...EMPTY_DOCUMENT_CONTEXT, financeByDocument: { op: {
      invoiceAllocations: [], paymentAllocations: [], paymentInstruments: [{
        id: 'instrument', kind: 'cash' as const, status: 'confirmed' as const, amount: '100.00',
        receivedOn: null, dueOn: null, settledOn: '2026-11-05', reference: '', bank: '',
      }],
    } } }
    expect(initialDocumentValues({ options: [], document, initialContext }).monto).toBe('1.234,56')
    const instrument = initialContext.financeByDocument.op.paymentInstruments[0]
    const reconciledContext = { ...initialContext, financeByDocument: { op: {
      ...initialContext.financeByDocument.op,
      paymentInstruments: [instrument, { ...instrument, id: 'retired', status: 'voided' as const, amount: '40.00' }],
    } } }
    expect(initialDocumentValues({ options: [], document: { ...document, monto: 100 }, initialContext: reconciledContext }).monto).toBe('100,00')
  })

  it('preserva la evidencia sin asignar y agrega solo el remanente exacto', () => {
    const result = invoiceDistribution([unknown], '150,01')
    expect(result.remainder).toBe(BigInt(5001))
    expect(result.rows).toEqual([unknown, {
      budgetId: null, equipmentId: null, equipmentStatus: 'unknown', amount: '50.01', historicalSettledAmount: '0',
    }])
  })

  it('no inventa un remanente cuando hay importes inválidos o se supera el total', () => {
    expect(invoiceDistribution([{ ...unknown, amount: 'error' }], '150').remainder).toBeNull()
    expect(invoiceDistribution([unknown], '50').rows).toHaveLength(1)
  })

  it('usa la versión capturada y convierte importes sin sumar con flotantes', () => {
    const snapshot: DocumentFinance = { invoiceAllocations: [], paymentInstruments: [{
      id: 'a4efdb81-1985-4b99-896b-f2be9865dc2d', kind: 'cash', status: 'confirmed', amount: '1.234,56',
      receivedOn: null, dueOn: null, settledOn: '2026-11-05', reference: '', bank: '',
    }], paymentAllocations: [] }
    expect(financeInput('orden_pago', snapshot, 3, '', '1.234,56')).toMatchObject({
      expectedVersion: 3, paymentInstruments: [{ amount: '1234.56' }],
    })
  })
})
