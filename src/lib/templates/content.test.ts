import { describe, expect, it } from 'vitest'
import { FORMATOS, UNIDADES, readBlocks, readItemsTemplate } from './content'

describe('leerBloques', () => {
  it('acepta una lista de {titulo, contenido} y los deja visibles', () => {
    expect(readBlocks([{ titulo: 'Alcance', contenido: '- Item' }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', hidden: false },
    ])
  })

  it('conserva la marca de oculto', () => {
    expect(readBlocks([{ titulo: 'Alcance', contenido: '- Item', hidden: true }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', hidden: true },
    ])
  })

  it('conserva los bloques ocultos guardados antes del renombrado', () => {
    expect(readBlocks([{ titulo: 'Alcance', contenido: '- Item', oculto: true }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', hidden: true },
    ])
  })

  it('prioriza la marca actual cuando aparecen ambos nombres', () => {
    expect(readBlocks([{ titulo: 'Alcance', contenido: '- Item', hidden: false, oculto: true }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', hidden: false },
    ])
  })

  it('rechaza datos con otra forma', () => {
    expect(() => readBlocks([{ titulo: 1 }])).toThrow()
    expect(() => readBlocks({})).toThrow()
    expect(() => readBlocks([{ titulo: 'Alcance', contenido: '', hidden: 'si' }])).toThrow()
    expect(() => readBlocks([{ titulo: 'Alcance', contenido: '', oculto: 'si' }])).toThrow()
  })
})

describe('leerItemsPlantilla', () => {
  it('acepta ítems con unidad válida y cantidad positiva', () => {
    const items = [{ seccion: 'Precios Jornada', descripcion: 'Jornada', unidad: 'JORNADA', cantidad: 1 }]
    expect(readItemsTemplate(items)).toEqual(items)
  })

  it('rechaza unidades desconocidas', () => {
    expect(() => readItemsTemplate([{ seccion: '', descripcion: 'x', unidad: 'LITRO', cantidad: 1 }])).toThrow()
  })
})

describe('catálogos', () => {
  it('expone los formatos y las unidades del diseño', () => {
    expect(Object.keys(FORMATOS)).toEqual(['mensual', 'jornada'])
    expect(UNIDADES).toEqual(['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'])
  })
})
