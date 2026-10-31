import { describe, expect, it } from 'vitest'
import { antiguedadCobranza, isQueueHome, pageValid, vencimientoPending } from './model'

describe('pendientes de Inicio', () => {
  it('distingue el día de vencimiento, los vencidos y el límite de 7 días', () => {
    expect(vencimientoPending('2026-10-27', '2026-10-28')).toEqual({ texto: 'Venció hace 1 d', tone: 'peligro' })
    expect(vencimientoPending('2026-10-28', '2026-10-28').texto).toBe('Vence hoy')
    expect(vencimientoPending('2026-10-29', '2026-10-28').texto).toBe('Vence mañana')
    expect(vencimientoPending('2026-11-04', '2026-10-28').tone).toBe('aviso')
    expect(vencimientoPending('2026-11-05', '2026-10-28').tone).toBe('neutro')
  })

  it('cambia de tramo exactamente a los 30, 45 y 60 días', () => {
    expect([29, 30, 44, 45, 59, 60].map((dias) => antiguedadCobranza(dias).texto))
      .toEqual(['29 días', '30+ días', '30+ días', '45+ días', '45+ días', '60+ días'])
  })

  it('valida colas y páginas sin aceptar propiedades heredadas ni offsets inválidos', () => {
    expect(isQueueHome('cobranzas')).toBe(true)
    expect(isQueueHome('toString')).toBe(false)
    expect(isQueueHome(['cobranzas'])).toBe(false)
    expect(['-2', 'NaN', '0', '1.5', '9999999999999'].map(pageValid)).toEqual([1, 1, 1, 1, 1])
    expect(pageValid('20')).toBe(20)
  })
})
