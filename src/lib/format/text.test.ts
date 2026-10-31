import { describe, expect, it } from 'vitest'
import { iniciales } from './text'

describe('iniciales', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(iniciales('Yanina Colman')).toBe('YC')
    expect(iniciales('carla  ñancucheo de la torre')).toBe('CÑ')
  })

  it('respeta el máximo pedido', () => {
    expect(iniciales('VERTICE SERVICIOS INTEGRALES S.R.L.', 1)).toBe('V')
  })

  it('tolera espacios sobrantes y textos vacíos', () => {
    expect(iniciales('  Milicic S.A. ', 1)).toBe('M')
    expect(iniciales('')).toBe('')
  })
})
