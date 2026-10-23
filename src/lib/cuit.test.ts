import { describe, expect, it } from 'vitest'
import { formatCuit, normalizarCuit, validarCuit } from './cuit'

describe('normalizarCuit', () => {
  it('deja solo los dígitos', () => {
    expect(normalizarCuit('30-71952967-0')).toBe('30719529670')
    expect(normalizarCuit(' 30 71952967 0 ')).toBe('30719529670')
  })
})

describe('validarCuit', () => {
  it.each([
    '30-71952967-0', // Vértice Servicios Integrales S.R.L. (cotización 112711)
    '30719529670',
    '33-69345023-9', // AFIP
  ])('acepta %s', (cuit) => {
    expect(validarCuit(cuit)).toBe(true)
  })

  it.each([
    ['30-71952967-1', 'dígito verificador incorrecto'],
    ['3071952967', 'menos de 11 dígitos'],
    ['307195296701', 'más de 11 dígitos'],
    ['11-71952967-0', 'prefijo inexistente'],
    ['', 'vacío'],
  ])('rechaza %s (%s)', (cuit) => {
    expect(validarCuit(cuit)).toBe(false)
  })
})

describe('formatCuit', () => {
  it('formatea como XX-XXXXXXXX-X', () => {
    expect(formatCuit('30719529670')).toBe('30-71952967-0')
    expect(formatCuit('30-71952967-0')).toBe('30-71952967-0')
  })

  it('devuelve la entrada sin tocar si no tiene 11 dígitos', () => {
    expect(formatCuit('123')).toBe('123')
  })
})
