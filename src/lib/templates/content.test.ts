import { describe, expect, it } from 'vitest'
import { FORMATOS, UNIDADES, leerBloques, leerItemsPlantilla } from './contenido'

describe('leerBloques', () => {
  it('acepta una lista de {titulo, contenido} y los deja visibles', () => {
    expect(leerBloques([{ titulo: 'Alcance', contenido: '- Item' }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', oculto: false },
    ])
  })

  it('conserva la marca de oculto', () => {
    expect(leerBloques([{ titulo: 'Alcance', contenido: '- Item', oculto: true }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', oculto: true },
    ])
  })

  it('rechaza datos con otra forma', () => {
    expect(() => leerBloques([{ titulo: 1 }])).toThrow()
    expect(() => leerBloques({})).toThrow()
    expect(() => leerBloques([{ titulo: 'Alcance', contenido: '', oculto: 'si' }])).toThrow()
  })
})

describe('leerItemsPlantilla', () => {
  it('acepta ítems con unidad válida y cantidad positiva', () => {
    const items = [{ seccion: 'Precios Jornada', descripcion: 'Jornada', unidad: 'JORNADA', cantidad: 1 }]
    expect(leerItemsPlantilla(items)).toEqual(items)
  })

  it('rechaza unidades desconocidas', () => {
    expect(() => leerItemsPlantilla([{ seccion: '', descripcion: 'x', unidad: 'LITRO', cantidad: 1 }])).toThrow()
  })
})

describe('catálogos', () => {
  it('expone los formatos y las unidades del diseño', () => {
    expect(Object.keys(FORMATOS)).toEqual(['mensual', 'jornada'])
    expect(UNIDADES).toEqual(['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'])
  })
})
