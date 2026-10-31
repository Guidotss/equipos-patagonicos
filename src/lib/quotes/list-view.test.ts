import { describe, expect, it } from 'vitest'
import { resumenCotizacion } from './lista'
import {
  atajosFechas,
  filaCotizacion,
  filasMostradas,
  textoRangoFechas,
  totalPaginas,
  type FilaVistaLista,
} from './lista-vista'

function fila(cambios: Partial<FilaVistaLista> = {}): FilaVistaLista {
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
    ...cambios,
  }
}

describe('filaCotizacion', () => {
  it('arma la fila: fechas cortas, formato en castellano y el trabajo resumido', () => {
    const entrada = fila()
    expect(filaCotizacion(entrada)).toEqual({
      id: entrada.id,
      numero: 112711,
      origen: null,
      fecha: '20/10/2026',
      cliente: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
      trabajo: resumenCotizacion(entrada),
      formato: 'Por jornada',
      estado: 'enviada',
      vencida: false,
      venceEl: '19/11/2026',
      tienePdf: true,
    })
  })

  it('"Vence el" solo en las enviadas, al día o vencidas', () => {
    expect(filaCotizacion(fila({ vencida: true }))).toMatchObject({ vencida: true, venceEl: '19/11/2026' })
    for (const estado of ['borrador', 'aprobada', 'rechazada']) {
      expect(filaCotizacion(fila({ estado, vencida: false })).venceEl).toBeNull()
    }
    expect(filaCotizacion(fila({ vencida: null, vence_el: null })).venceEl).toBeNull()
  })

  it('marca las cargadas y las directas; una directa no tiene PDF y ninguna de las dos tiene formato', () => {
    // Su formato es el valor por defecto de importar.sql y no dice nada: se muestra el origen (relev-pendientes A).
    expect(filaCotizacion(fila({ origen: 'importada' }))).toMatchObject({ origen: 'Cargada', tienePdf: true, formato: '—' })
    expect(filaCotizacion(fila({ origen: 'directa', estado: 'aprobada' }))).toMatchObject({
      origen: 'Directa',
      tienePdf: false,
      venceEl: null,
      formato: '—',
    })
  })

  it('un formato desconocido se muestra tal cual', () => {
    expect(filaCotizacion(fila({ formato: 'otro' })).formato).toBe('otro')
  })
})

describe('totalPaginas y filasMostradas', () => {
  it('de a 25, con al menos una página', () => {
    expect([0, 1, 25, 26, 50, 51].map(totalPaginas)).toEqual([1, 1, 1, 2, 2, 3])
  })

  it('las posiciones que muestra cada página', () => {
    expect(filasMostradas(1, 48)).toEqual({ desde: 1, hasta: 25 })
    expect(filasMostradas(2, 48)).toEqual({ desde: 26, hasta: 48 })
    expect(filasMostradas(2, 29)).toEqual({ desde: 26, hasta: 29 })
    expect(filasMostradas(1, 0)).toEqual({ desde: 0, hasta: 0 })
  })
})

describe('atajosFechas', () => {
  it('este mes, el anterior y los últimos 90 días (contando hoy)', () => {
    expect(atajosFechas('2026-10-25')).toEqual([
      { etiqueta: 'Este mes', desde: '2026-10-01', hasta: '2026-10-31' },
      { etiqueta: 'Mes anterior', desde: '2026-09-01', hasta: '2026-09-30' },
      { etiqueta: 'Últimos 90 días', desde: '2026-07-28', hasta: '2026-10-25' },
    ])
  })

  it('cruza el año y respeta febrero (también el bisiesto)', () => {
    expect(atajosFechas('2027-01-15').slice(0, 2)).toEqual([
      { etiqueta: 'Este mes', desde: '2027-01-01', hasta: '2027-01-31' },
      { etiqueta: 'Mes anterior', desde: '2026-12-01', hasta: '2026-12-31' },
    ])
    expect(atajosFechas('2026-02-14')[0]).toMatchObject({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(atajosFechas('2028-03-10')[1]).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

describe('textoRangoFechas', () => {
  it('describe el rango como se ve en el botón', () => {
    expect(textoRangoFechas('', '')).toBe('Cualquier fecha')
    expect(textoRangoFechas('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026')
    expect(textoRangoFechas('2026-10-01', '')).toBe('Desde 01/10/2026')
    expect(textoRangoFechas('', '2026-10-31')).toBe('Hasta 31/10/2026')
  })
})
