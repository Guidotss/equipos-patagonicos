import { describe, expect, it } from 'vitest'
import { centsToDecimal, formatFinancialAmount, parseAmountCents, sumCents } from './amounts'

describe('importes financieros exactos', () => {
  it('interpreta texto argentino y suma centavos sin coma flotante', () => {
    expect(sumCents([parseAmountCents('100,10')!, parseAmountCents('0,20')!])).toBe(BigInt(10030))
    expect(parseAmountCents('1.234.567,89')).toBe(BigInt(123456789))
    expect(parseAmountCents('0,001')).toBeNull()
    expect(parseAmountCents('1000000000000')).toBeNull()
  })
  it('soporta agregados mayores al entero seguro y muestra el signo incluso en fracciones', () => {
    const total = sumCents(Array(200).fill(BigInt('99999999999999')))
    expect(centsToDecimal(total)).toBe('199999999999998.00')
    expect(formatFinancialAmount('-0.50')).toBe('$ -0,50')
    expect(formatFinancialAmount('-0.00')).toBe('$ 0,00')
    expect(formatFinancialAmount('-1234.56')).toBe('$ -1.234,56')
  })
})
