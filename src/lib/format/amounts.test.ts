import { describe, expect, it } from 'vitest'
import { formatCurrency, formatAmountDaily, formatAmountTable, parsePrice } from './amounts'

describe('formatMontoTabla', () => {
  it('usa punto de miles y coma decimal con 2 decimales, como la tabla mensual', () => {
    expect(formatAmountTable(39_000_000)).toBe('39.000.000,00')
    expect(formatAmountTable(260_000)).toBe('260.000,00')
    expect(formatAmountTable(5_000)).toBe('5.000,00')
    expect(formatAmountTable(1_234.5)).toBe('1.234,50')
  })
})

describe('formatMontoJornada', () => {
  it('formatea sin decimales con "$ " y ".-" como la cotización por jornada', () => {
    expect(formatAmountDaily(1_950_000)).toBe('$ 1.950.000.-')
    expect(formatAmountDaily(2_530_000)).toBe('$ 2.530.000.-')
  })

  it('redondea los centavos', () => {
    expect(formatAmountDaily(1_000.6)).toBe('$ 1.001.-')
  })
})

describe('formatMoneda', () => {
  it('formatea montos de pantalla con signo y 2 decimales', () => {
    expect(formatCurrency(1_950_000.5)).toBe('$ 1.950.000,50')
  })
})

describe('parsePrecio', () => {
  it.each([
    ['39.000.000', 39_000_000],
    ['39000000', 39_000_000],
    ['39.000.000,00', 39_000_000],
    ['1.950.000,50', 1_950_000.5],
    ['2,5', 2.5],
    ['2.5', 2.5],
    ['1.950', 1_950],
    ['$ 1.950.000', 1_950_000],
    ['$ 1.950.000.-', 1_950_000],
    ['2.530.000-', 2_530_000],
    ['  260.000  ', 260_000],
    ['0', 0],
  ])('interpreta %j como %d', (entrada, expected) => {
    expect(parsePrice(entrada)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'abc',
    '-5',
    '1.95.000',
    '1,2,3',
    '12a',
    '260,000',
    '1,999',
    '100 200',
    '39000000\t5000',
  ])('rechaza %j', (entrada) => {
    expect(parsePrice(entrada)).toBeNull()
  })
})
