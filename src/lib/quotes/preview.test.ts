// src/lib/cotizaciones/vista-previa.test.ts
import { describe, expect, it } from 'vitest'
import { statusNew, type StatusEditor } from './editor'
import {
  dateOfMark,
  lineViewPreview,
  messageErrorViewPreview,
  modeViewPreview,
  urlPdfCurrent,
  urlVisor,
  viewDesactualizada,
} from './preview'

const ID = '0b6f3c1e-5a2d-4f7e-9c8b-1d2e3f4a5b6c'
const CLIENTE = { id: '7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a', razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: null }

function estado(changes: Partial<StatusEditor> = {}): StatusEditor {
  return { ...statusNew({ plantilla: null, firmanteId: '', today: '2026-10-25' }), cliente: CLIENTE, ...changes }
}

describe('modoVistaPrevia', () => {
  it('un borrador o una enviada de la app se generan con lo que hay en pantalla', () => {
    expect(modeViewPreview(estado())).toEqual({ tipo: 'generada' })
    expect(modeViewPreview(estado({ id: ID, estado: 'enviada' }))).toEqual({ tipo: 'generada' })
  })

  it('sin cliente todavía no hay vista previa', () => {
    expect(modeViewPreview(estado({ cliente: null }))).toEqual({ tipo: 'sin-cliente' })
  })

  it('una aprobada, una rechazada o una cargada muestran el PDF guardado', () => {
    const guardada = { tipo: 'guardada', url: `/cotizaciones/${ID}/pdf` }
    expect(modeViewPreview(estado({ id: ID, estado: 'aprobada' }))).toEqual(guardada)
    expect(modeViewPreview(estado({ id: ID, estado: 'rechazada' }))).toEqual(guardada)
    expect(modeViewPreview(estado({ id: ID, estado: 'enviada', origen: 'importada' }))).toEqual(guardada)
  })

  it('un presupuesto directo no tiene PDF', () => {
    expect(modeViewPreview(estado({ id: ID, estado: 'aprobada', origen: 'directa' }))).toEqual({ tipo: 'sin-pdf' })
  })
})

describe('urls', () => {
  it('el visor va sin barra, sin miniaturas y al ancho', () => {
    expect(urlVisor('blob:http://localhost:3000/abc')).toBe('blob:http://localhost:3000/abc#toolbar=0&navpanes=0&view=FitH')
  })

  it('el celular abre la versión actual de lo guardado', () => {
    expect(urlPdfCurrent(ID)).toBe(`/cotizaciones/${ID}/pdf?actual=1`)
  })
})

describe('fechaDeMarca', () => {
  it('usa la fecha argentina del instante, no la UTC', () => {
    expect(dateOfMark('2026-10-21T02:30:00.123456+00:00')).toBe('20/10/2026')
    expect(dateOfMark('2026-10-20T15:00:00+00:00')).toBe('20/10/2026')
  })
})

describe('vistaDesactualizada', () => {
  it('sin vista previa generada no hay nada desactualizado', () => {
    expect(viewDesactualizada(null, estado())).toBe(false)
  })

  it('cambia con lo que se guarda y con el número, no con la identidad del objeto', () => {
    const base = estado({ asunto: 'Cotización' })
    expect(viewDesactualizada(base, { ...base })).toBe(false)
    expect(viewDesactualizada(base, { ...base, asunto: 'Cotización N° 112712' })).toBe(true)
    expect(viewDesactualizada(base, { ...base, numero: 112712 })).toBe(true)
  })
})

describe('lineaVistaPrevia', () => {
  const base = { estado: 'borrador', origen: 'app', desactualizada: false, lastSend: null, dateApproval: null } as const

  it('explica qué se está viendo en cada caso', () => {
    expect(lineViewPreview({ ...base, modo: { tipo: 'generada' } })).toBe('Con lo que hay en pantalla, aunque no esté guardado')
    expect(lineViewPreview({ ...base, modo: { tipo: 'generada' }, desactualizada: true })).toBe('Hay cambios sin reflejar')
    expect(
      lineViewPreview({ ...base, estado: 'enviada', modo: { tipo: 'generada' }, lastSend: '2026-10-20T15:00:00+00:00' }),
    ).toBe('Versión actual · el último envío es del 20/10/2026')
    expect(lineViewPreview({ ...base, modo: { tipo: 'sin-cliente' } })).toBe('Elegí el cliente para verla.')
    expect(lineViewPreview({ ...base, modo: { tipo: 'sin-pdf' } })).toBe('')
  })

  it('en lo guardado dice de dónde sale el PDF', () => {
    const guardada = { tipo: 'guardada', url: `/cotizaciones/${ID}/pdf` } as const
    expect(lineViewPreview({ ...base, estado: 'aprobada', modo: guardada, dateApproval: '2026-10-25' })).toBe(
      'PDF aprobado el 25/10/2026',
    )
    expect(lineViewPreview({ ...base, estado: 'enviada', origen: 'importada', modo: guardada })).toBe('PDF original cargado')
    expect(
      lineViewPreview({ ...base, estado: 'rechazada', modo: guardada, lastSend: '2026-10-20T15:00:00+00:00' }),
    ).toBe('Último envío · 20/10/2026')
  })
})

describe('mensajeErrorVistaPrevia', () => {
  it('distingue la sesión vencida, los datos que no validan y el resto', () => {
    expect(messageErrorViewPreview(401)).toBe('Tu sesión venció: volvé a ingresar para ver la vista previa.')
    expect(messageErrorViewPreview(400)).toBe('Hay datos que todavía no se pueden dibujar: revisalos y probá de nuevo.')
    expect(messageErrorViewPreview(500)).toBe('No se pudo generar la vista previa.')
    expect(messageErrorViewPreview(null)).toBe('No se pudo generar la vista previa.')
  })
})
