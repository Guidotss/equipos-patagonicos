import { describe, expect, it } from 'vitest'
import { formatCuit, normalizeCuit } from './cuit'

describe('normalizarCuit', () => {
  it('quita los separadores de una entrada numérica sin corregir sus dígitos', () => {
    expect(normalizeCuit('30-71952967-0')).toBe('30719529670')
    expect(normalizeCuit(' 30 71952967 0 ')).toBe('30719529670')
    expect(normalizeCuit('30-71952967-1')).toBe('30719529671')
  })

  it('conserva un texto informado sin eliminar letras ni espacios internos', () => {
    expect(normalizeCuit('  identificación pendiente  ')).toBe('identificación pendiente')
    expect(normalizeCuit(' CUIT 30-71952967-1 ')).toBe('CUIT 30-71952967-1')
  })
})

describe('formatCuit', () => {
  it('formatea como XX-XXXXXXXX-X', () => {
    expect(formatCuit('30719529670')).toBe('30-71952967-0')
    expect(formatCuit('30-71952967-0')).toBe('30-71952967-0')
  })

  it('devuelve la entrada sin tocar si no tiene 11 dígitos', () => {
    expect(formatCuit('123')).toBe('123')
    expect(formatCuit('CUIT 30719529670')).toBe('CUIT 30719529670')
  })
})
