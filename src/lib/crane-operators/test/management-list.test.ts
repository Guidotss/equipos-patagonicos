import { describe, expect, it } from 'vitest'
import {
  craneOperatorsHref,
  readManagementFilters,
  readManagementPage,
} from '.././management-list'
import { formatSubmissionTime } from '.././management-dates'

describe('filtros del directorio', () => {
  it('normaliza páginas inválidas y conserva los filtros válidos', () => {
    for (const page of [
      '0',
      '-1',
      '1.5',
      'invalida',
      '999999999999999999999',
      ['2'],
      undefined,
    ])
      expect(readManagementPage(page)).toBe(1)
    const filters = readManagementFilters({
      q: '  Lucía  ',
      active: 'inactive',
      page: '999999',
    })
    expect(filters).toEqual({ q: 'Lucía', active: 'inactive', page: 999999 })
    expect(craneOperatorsHref(filters, 1)).toBe(
      '/crane-operators?q=Luc%C3%ADa&active=inactive',
    )
    expect(craneOperatorsHref(filters, 2)).toBe(
      '/crane-operators?q=Luc%C3%ADa&active=inactive&page=2',
    )
  })
  it('acota búsquedas sin aceptar arrays ni estados ajenos al contrato', () => {
    expect(readManagementFilters({ q: ['otro'], active: 'otro' })).toEqual({
      q: '',
      active: 'all',
      page: 1,
    })
    expect(readManagementFilters({ q: 'a'.repeat(201) }).q).toHaveLength(200)
  })
})

describe('hora del envío', () => {
  it('muestra la fecha argentina del instante UTC que cruza la medianoche', () => {
    expect(formatSubmissionTime('2026-11-03T01:30:00Z')).toBe(
      '02/11/2026, 22:30',
    )
  })
})
