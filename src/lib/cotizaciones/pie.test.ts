import { describe, expect, it } from 'vitest'
import { lineaPie, tramosPie } from './pie'

describe('lineaPie', () => {
  it('une dirección, ciudad, país, teléfono y email como en las cotizaciones', () => {
    expect(
      lineaPie({ direccion: 'T. Planas 5168', ciudad: 'Neuquén', telefono: '0299 - 6019931', email: 'equipos@equipospatagonicos.com.ar' }),
    ).toBe('T. Planas 5168 - Neuquén - Argentina - Tel. 0299 - 6019931 - equipos@equipospatagonicos.com.ar')
  })

  it('saltea los datos vacíos sin dejar guiones de más', () => {
    expect(lineaPie({ direccion: '', ciudad: 'Neuquén', telefono: '', email: '' })).toBe('Neuquén - Argentina')
  })
})

describe('tramosPie', () => {
  it('separa los datos de la empresa de lo fijo, en el orden del pie', () => {
    expect(tramosPie({ direccion: '', ciudad: 'Neuquén', telefono: '299 1', email: '' })).toEqual([
      { prefijo: '', valor: 'Neuquén', fijo: false },
      { prefijo: '', valor: 'Argentina', fijo: true },
      { prefijo: 'Tel. ', valor: '299 1', fijo: false },
    ])
  })
})
