import { describe, expect, it } from 'vitest'
import {
  equipmentRevenueHref,
  parseEquipmentRevenue,
  readEquipmentRevenueQuery,
} from './report'

describe('filtros del informe de facturación por grúa', () => {
  it('acepta límites independientes, inclusivos y días bisiestos', () => {
    expect(readEquipmentRevenueQuery({})).toEqual({
      from: '',
      to: '',
      review: null,
      page: 1,
      error: null,
    })
    expect(readEquipmentRevenueQuery({ hasta: '2024-02-29' })).toMatchObject({
      from: '',
      to: '2024-02-29',
      error: null,
    })
    expect(
      readEquipmentRevenueQuery({ desde: '2024-02-29', hasta: '2024-02-29' })
        .error,
    ).toBeNull()
    expect(readEquipmentRevenueQuery({ desde: '0001-01-01' }).error).toBeNull()
  })

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-2-01',
    '01/02/2026',
    '0000-01-01',
    '2026-02-01\n',
  ])('rechaza la fecha %j sin descartar el otro límite', (from) => {
    expect(
      readEquipmentRevenueQuery({ desde: from, hasta: '2026-03-01' }),
    ).toMatchObject({
      from,
      to: '2026-03-01',
      error: expect.stringContaining('Desde'),
    })
  })

  it('conserva un rango invertido y rechaza parámetros de fecha repetidos', () => {
    expect(
      readEquipmentRevenueQuery({ desde: '2026-02-02', hasta: '2026-02-01' }),
    ).toMatchObject({
      from: '2026-02-02',
      to: '2026-02-01',
      error: 'Desde debe ser anterior o igual a Hasta.',
    })
    expect(
      readEquipmentRevenueQuery({ desde: ['2026-02-01', '2026-02-02'] }).error,
    ).toContain('Desde')
  })

  it('mantiene ambos límites y la revisión al paginar', () => {
    const query = readEquipmentRevenueQuery({
      desde: '2026-02-01',
      hasta: '2026-02-02',
      revisar: 'unknown',
      pagina: '2',
    })
    expect(equipmentRevenueHref(query, query.review, query.page)).toBe(
      '/reports/equipment-revenue?desde=2026-02-01&hasta=2026-02-02&revisar=unknown&pagina=2',
    )
    expect(equipmentRevenueHref(query)).toBe(
      '/reports/equipment-revenue?desde=2026-02-01&hasta=2026-02-02',
    )
    expect(
      readEquipmentRevenueQuery({ revisar: 'unknown', pagina: '1e2' }).page,
    ).toBe(1)
  })
})

describe('contrato del informe', () => {
  const summary = {
    kind: 'summary',
    period: { amount: '123456789012345678901234567890.01', invoiceCount: 2 },
    undated: { amount: '0', invoiceCount: 0 },
    groups: [
      {
        category: 'unknown',
        equipmentId: null,
        equipmentName: null,
        active: null,
        amount: '0.01',
        invoiceCount: 1,
      },
    ],
  }

  it('conserva importes exactos y rechaza números o fracciones subcentavo', () => {
    expect(parseEquipmentRevenue(summary)).toEqual(summary)
    expect(() =>
      parseEquipmentRevenue({
        ...summary,
        period: { amount: 123.01, invoiceCount: 2 },
      }),
    ).toThrow()
    expect(() =>
      parseEquipmentRevenue({
        ...summary,
        period: { amount: '123.001', invoiceCount: 2 },
      }),
    ).toThrow()
  })

  it('valida identificadores y permite revisar documentos sin fecha', () => {
    const invoice = {
      id: crypto.randomUUID(),
      number: '',
      issuedOn: null,
      amount: '10.00',
    }
    const review = {
      kind: 'review',
      category: 'undated',
      total: 1,
      page: 1,
      pageSize: 25,
      invoices: [invoice],
    }
    expect(parseEquipmentRevenue(review)).toEqual(review)
    expect(() =>
      parseEquipmentRevenue({
        ...review,
        invoices: [{ ...invoice, id: 'un-id-inválido' }],
      }),
    ).toThrow()
  })
})
