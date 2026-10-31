import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  headerDate,
  isDate,
  isMonth,
  dateInLetters,
  formatShortDate,
  todayArgentina,
  monthInLetters,
  addDays,
} from './dates'

describe('fechaEnLetras', () => {
  it('escribe la fecha como en las cotizaciones', () => {
    expect(dateInLetters('2026-10-22')).toBe('22 de octubre de 2026')
    expect(dateInLetters('2026-07-15')).toBe('15 de julio de 2026')
    expect(dateInLetters('2026-08-01')).toBe('1 de agosto de 2026')
  })

  it('rechaza fechas mal formadas', () => {
    expect(() => dateInLetters('22/10/2026')).toThrow('Fecha inválida')
    expect(() => dateInLetters('2026-13-01')).toThrow('Fecha inválida')
  })

  it('rechaza fechas que no existen en el calendario', () => {
    expect(() => dateInLetters('2026-02-30')).toThrow('Fecha inválida')
    expect(() => dateInLetters('2027-02-29')).toThrow('Fecha inválida')
    expect(() => formatShortDate('2026-04-31')).toThrow('Fecha inválida')
    expect(() => addDays('2026-02-30', 0)).toThrow('Fecha inválida')
    expect(() => addDays('0050-01-01', 1)).toThrow('Fecha inválida')
  })

  it('acepta el 29 de febrero en año bisiesto', () => {
    expect(dateInLetters('2028-02-29')).toBe('29 de febrero de 2028')
  })
})

describe('encabezadoFecha', () => {
  it('arma "Ciudad, fecha." como el encabezado del PDF', () => {
    expect(headerDate('Neuquén', '2026-10-22')).toBe('Neuquén, 22 de octubre de 2026.')
  })
})

describe('formatFechaCorta', () => {
  it('usa dd/mm/aaaa', () => {
    expect(formatShortDate('2026-07-24')).toBe('24/07/2026')
  })
})

describe('hoyArgentina', () => {
  it('a las 22:30 de Argentina (01:30 UTC del día siguiente) sigue siendo el mismo día', () => {
    expect(todayArgentina(new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22')
  })

  it('a las 00:00 de Argentina ya es el día siguiente', () => {
    expect(todayArgentina(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-23')
  })
})

describe('sumarDias y diasEntre', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-10-22', 30)).toBe('2026-11-21')
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('cuenta días entre dos fechas', () => {
    expect(daysBetween('2026-10-22', '2026-11-21')).toBe(30)
    expect(daysBetween('2026-11-21', '2026-10-22')).toBe(-30)
  })
})

describe('mesEnLetras', () => {
  it('escribe el mes como la próxima actualización del PDF', () => {
    expect(monthInLetters('2026-11')).toBe('noviembre de 2026')
    expect(monthInLetters('2027-01')).toBe('enero de 2027')
    expect(monthInLetters('2026-09')).toBe('septiembre de 2026')
    expect(monthInLetters('2026-12')).toBe('diciembre de 2026')
  })

  it('un mes vacío queda vacío', () => {
    expect(monthInLetters('')).toBe('')
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '2026/11', '2026-11-01', ' 2026-11', '0999-11', 'noviembre'])(
    'rechaza %j',
    (month) => {
      expect(() => monthInLetters(month)).toThrow('Mes inválido')
    },
  )
})

describe('esMes y esFecha', () => {
  it('esMes acepta solo YYYY-MM con un mes que existe', () => {
    expect(isMonth('2026-11')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('')).toBe(false)
  })

  it('esFecha acepta solo fechas que existen en el calendario', () => {
    expect(isDate('2026-10-22')).toBe(true)
    expect(isDate('2028-02-29')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('0050-01-01')).toBe(false)
    expect(isDate('22/10/2026')).toBe(false)
    expect(isDate('')).toBe(false)
  })
})
