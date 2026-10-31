import { describe, expect, it } from 'vitest'
import { resumenQuote } from './list'
import {
  dateShortcuts,
  rowQuote,
  rowsMostradas,
  formatDateRange,
  totalPages,
  type RowViewList,
} from './list-view'

function row(changes: Partial<RowViewList> = {}): RowViewList {
  return {
    id: '7f8e2c1a-0b4d-4e6f-9a1b-2c3d4e5f6a7b',
    numero: 112711,
    origen: 'app',
    fecha: '2026-10-20',
    cliente_razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
    formato: 'jornada',
    estado: 'enviada',
    vencida: false,
    vence_el: '2026-11-19',
    asunto: 'Grúa de {{capacidad}} TN en {{ubicacion}}',
    datos: { ubicacion: 'Añelo' },
    equipo: { nombre: 'Grúa telescópica XCMG QY70K-1 40 TN' },
    ...changes,
  }
}

describe('filaCotizacion', () => {
  it('arma la fila: fechas cortas, formato en castellano y el trabajo resumido', () => {
    const entrada = row()
    expect(rowQuote(entrada)).toEqual({
      id: entrada.id,
      numero: 112711,
      origen: null,
      fecha: '20/10/2026',
      cliente: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
      trabajo: resumenQuote(entrada),
      formato: 'Por jornada',
      estado: 'enviada',
      vencida: false,
      venceEl: '19/11/2026',
      tienePdf: true,
    })
  })

  it('"Vence el" solo en las enviadas, al día o vencidas', () => {
    expect(rowQuote(row({ vencida: true }))).toMatchObject({ vencida: true, venceEl: '19/11/2026' })
    for (const estado of ['borrador', 'aprobada', 'rechazada']) {
      expect(rowQuote(row({ estado, vencida: false })).venceEl).toBeNull()
    }
    expect(rowQuote(row({ vencida: null, vence_el: null })).venceEl).toBeNull()
  })

  it('marca las cargadas y las directas; una directa no tiene PDF y ninguna de las dos tiene formato', () => {
    // Su formato es el valor por defecto de importar.sql y no dice nada: se muestra el origen (relev-pendientes A).
    expect(rowQuote(row({ origen: 'importada' }))).toMatchObject({ origen: 'Cargada', tienePdf: true, formato: '—' })
    expect(rowQuote(row({ origen: 'directa', estado: 'aprobada' }))).toMatchObject({
      origen: 'Directa',
      tienePdf: false,
      venceEl: null,
      formato: '—',
    })
  })

  it('un formato desconocido se muestra tal cual', () => {
    expect(rowQuote(row({ formato: 'otro' })).formato).toBe('otro')
  })
})

describe('totalPaginas y filasMostradas', () => {
  it('de a 25, con al menos una página', () => {
    expect([0, 1, 25, 26, 50, 51].map(totalPages)).toEqual([1, 1, 1, 2, 2, 3])
  })

  it('las posiciones que muestra cada página', () => {
    expect(rowsMostradas(1, 48)).toEqual({ desde: 1, hasta: 25 })
    expect(rowsMostradas(2, 48)).toEqual({ desde: 26, hasta: 48 })
    expect(rowsMostradas(2, 29)).toEqual({ desde: 26, hasta: 29 })
    expect(rowsMostradas(1, 0)).toEqual({ desde: 0, hasta: 0 })
  })
})

describe('atajosFechas', () => {
  it('este mes, el anterior y los últimos 90 días (contando hoy)', () => {
    expect(dateShortcuts('2026-10-25')).toEqual([
      { label: 'Este mes', desde: '2026-10-01', hasta: '2026-10-31' },
      { label: 'Mes anterior', desde: '2026-09-01', hasta: '2026-09-30' },
      { label: 'Últimos 90 días', desde: '2026-07-28', hasta: '2026-10-25' },
    ])
  })

  it('cruza el año y respeta febrero (también el bisiesto)', () => {
    expect(dateShortcuts('2027-01-15').slice(0, 2)).toEqual([
      { label: 'Este mes', desde: '2027-01-01', hasta: '2027-01-31' },
      { label: 'Mes anterior', desde: '2026-12-01', hasta: '2026-12-31' },
    ])
    expect(dateShortcuts('2026-02-14')[0]).toMatchObject({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(dateShortcuts('2028-03-10')[1]).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

describe('textoRangoFechas', () => {
  it('describe el rango como se ve en el botón', () => {
    expect(formatDateRange('', '')).toBe('Cualquier fecha')
    expect(formatDateRange('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026')
    expect(formatDateRange('2026-10-01', '')).toBe('Desde 01/10/2026')
    expect(formatDateRange('', '2026-10-31')).toBe('Hasta 31/10/2026')
  })
})
