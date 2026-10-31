import { describe, expect, it } from 'vitest'
import { lineFooter, tramosFooter } from './footer'

describe('lineaPie', () => {
  it('une dirección, ciudad, país, teléfono y email como en las cotizaciones', () => {
    expect(
      lineFooter({ direccion: 'T. Planas 5168', ciudad: 'Neuquén', telefono: '0299 - 6019931', email: 'equipos@equipospatagonicos.com.ar' }),
    ).toBe('T. Planas 5168 - Neuquén - Argentina - Tel. 0299 - 6019931 - equipos@equipospatagonicos.com.ar')
  })

  it('saltea los datos vacíos sin dejar guiones de más', () => {
    expect(lineFooter({ direccion: '', ciudad: 'Neuquén', telefono: '', email: '' })).toBe('Neuquén - Argentina')
  })
})

describe('tramosPie', () => {
  it('separa los datos de la empresa de lo fijo, en el orden del pie', () => {
    expect(tramosFooter({ direccion: '', ciudad: 'Neuquén', telefono: '299 1', email: '' })).toEqual([
      { prefix: '', value: 'Neuquén', fijo: false },
      { prefix: '', value: 'Argentina', fijo: true },
      { prefix: 'Tel. ', value: '299 1', fijo: false },
    ])
  })
})
