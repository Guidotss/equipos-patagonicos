import { describe, expect, it } from 'vitest'
import {
  diasEntre,
  encabezadoFecha,
  fechaEnLetras,
  formatFechaCorta,
  hoyArgentina,
  sumarDias,
} from './fechas'

describe('fechaEnLetras', () => {
  it('escribe la fecha como en las cotizaciones', () => {
    expect(fechaEnLetras('2026-10-22')).toBe('22 de octubre de 2026')
    expect(fechaEnLetras('2026-07-15')).toBe('15 de julio de 2026')
    expect(fechaEnLetras('2026-08-01')).toBe('1 de agosto de 2026')
  })

  it('rechaza fechas mal formadas', () => {
    expect(() => fechaEnLetras('22/10/2026')).toThrow('Fecha inválida')
    expect(() => fechaEnLetras('2026-13-01')).toThrow('Fecha inválida')
  })

  it('rechaza fechas que no existen en el calendario', () => {
    expect(() => fechaEnLetras('2026-02-30')).toThrow('Fecha inválida')
    expect(() => fechaEnLetras('2027-02-29')).toThrow('Fecha inválida')
    expect(() => formatFechaCorta('2026-04-31')).toThrow('Fecha inválida')
    expect(() => sumarDias('2026-02-30', 0)).toThrow('Fecha inválida')
    expect(() => sumarDias('0050-01-01', 1)).toThrow('Fecha inválida')
  })

  it('acepta el 29 de febrero en año bisiesto', () => {
    expect(fechaEnLetras('2028-02-29')).toBe('29 de febrero de 2028')
  })
})

describe('encabezadoFecha', () => {
  it('arma "Ciudad, fecha." como el encabezado del PDF', () => {
    expect(encabezadoFecha('Neuquén', '2026-10-22')).toBe('Neuquén, 22 de octubre de 2026.')
  })
})

describe('formatFechaCorta', () => {
  it('usa dd/mm/aaaa', () => {
    expect(formatFechaCorta('2026-07-24')).toBe('24/07/2026')
  })
})

describe('hoyArgentina', () => {
  it('a las 22:30 de Argentina (01:30 UTC del día siguiente) sigue siendo el mismo día', () => {
    expect(hoyArgentina(new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22')
  })

  it('a las 00:00 de Argentina ya es el día siguiente', () => {
    expect(hoyArgentina(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-23')
  })
})

describe('sumarDias y diasEntre', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-10-22', 30)).toBe('2026-11-21')
    expect(sumarDias('2026-12-20', 15)).toBe('2027-01-04')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('cuenta días entre dos fechas', () => {
    expect(diasEntre('2026-10-22', '2026-11-21')).toBe(30)
    expect(diasEntre('2026-11-21', '2026-10-22')).toBe(-30)
  })
})
