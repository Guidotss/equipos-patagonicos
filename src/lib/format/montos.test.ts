import { describe, expect, it } from 'vitest'
import { formatMoneda, formatMontoJornada, formatMontoTabla, parsePrecio } from './montos'

describe('formatMontoTabla', () => {
  it('usa punto de miles y coma decimal con 2 decimales, como la tabla mensual', () => {
    expect(formatMontoTabla(39_000_000)).toBe('39.000.000,00')
    expect(formatMontoTabla(260_000)).toBe('260.000,00')
    expect(formatMontoTabla(5_000)).toBe('5.000,00')
    expect(formatMontoTabla(1_234.5)).toBe('1.234,50')
  })
})

describe('formatMontoJornada', () => {
  it('formatea sin decimales con "$ " y ".-" como la cotización por jornada', () => {
    expect(formatMontoJornada(1_950_000)).toBe('$ 1.950.000.-')
    expect(formatMontoJornada(2_530_000)).toBe('$ 2.530.000.-')
  })

  it('redondea los centavos', () => {
    expect(formatMontoJornada(1_000.6)).toBe('$ 1.001.-')
  })
})

describe('formatMoneda', () => {
  it('formatea montos de pantalla con signo y 2 decimales', () => {
    expect(formatMoneda(1_950_000.5)).toBe('$ 1.950.000,50')
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
  ])('interpreta %j como %d', (entrada, esperado) => {
    expect(parsePrecio(entrada)).toBe(esperado)
  })

  it.each(['', '   ', 'abc', '-5', '1.95.000', '1,2,3', '12a', '260,000', '1,999'])('rechaza %j', (entrada) => {
    expect(parsePrecio(entrada)).toBeNull()
  })
})
