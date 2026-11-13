import { describe, expect, it } from 'vitest'
import { schemaFinance } from '.././schemas'

const id = 'a26362c7-b6e2-4ba2-bcaa-555555555555'
const check = {
  id,
  kind: 'check',
  status: 'pending',
  amount: '100.10',
  receivedOn: null,
  dueOn: '2025-01-01',
  settledOn: null,
  reference: '',
  bank: '',
}

describe('distribuciones financieras', () => {
  it('acepta colecciones omitidas y vacías como solicitudes distintas', () => {
    expect(schemaFinance.parse({ expectedVersion: 1 })).not.toHaveProperty(
      'paymentAllocations',
    )
    expect(
      schemaFinance.parse({ expectedVersion: 1, paymentAllocations: [] })
        .paymentAllocations,
    ).toEqual([])
  })
  it('rechaza precisión excesiva, medios repetidos y estados incompatibles', () => {
    expect(
      schemaFinance.safeParse({
        paymentInstruments: [{ ...check, amount: '0.001' }],
      }).success,
    ).toBe(false)
    expect(
      schemaFinance.safeParse({ paymentInstruments: [check, check] }).success,
    ).toBe(false)
    expect(
      schemaFinance.safeParse({
        paymentInstruments: [
          { ...check, status: 'confirmed', settledOn: '2024-01-01' },
        ],
      }).success,
    ).toBe(false)
  })
  it('valida asignación de equipo y límites históricos', () => {
    const allocation = {
      budgetId: id,
      equipmentId: null,
      equipmentStatus: 'unknown',
      amount: '10',
      historicalSettledAmount: '11',
    }
    expect(
      schemaFinance.safeParse({ invoiceAllocations: [allocation] }).success,
    ).toBe(false)
    expect(
      schemaFinance.safeParse({
        invoiceAllocations: [
          {
            ...allocation,
            historicalSettledAmount: '0',
            equipmentStatus: 'assigned',
          },
        ],
      }).success,
    ).toBe(false)
  })
})
