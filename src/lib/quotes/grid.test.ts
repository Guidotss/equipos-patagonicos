// src/lib/quotes/grid.test.ts
import { describe, expect, it } from 'vitest'
import {
  focusDestination,
  errorsByKey,
  rowsGrid,
  readQuantity,
  nameSectionNew,
  normalizePrice,
  totalGeneral,
  totalLine,
  neighborOnRemove,
} from './grid'

const item = (key: string, section = '', quantity = '1', price = '') => ({ clave: key, seccion: section, cantidad: quantity, precio: price })

describe('filasGrilla', () => {
  it('sin secciones son solo ítems', () => {
    expect(rowsGrid([item('a'), item('b')])).toEqual([
      { type: 'item', index: 0 },
      { type: 'item', index: 1 },
    ])
  })

  it('un encabezado por cada grupo consecutivo, con la clave y el índice de su primer ítem', () => {
    expect(
      rowsGrid([item('a', 'Precios Jornada'), item('b', 'Precios Jornada'), item('c', 'Precios Jornada Adicional')]),
    ).toEqual([
      { type: 'seccion', key: 'a', index: 0, section: 'Precios Jornada', number: 1 },
      { type: 'item', index: 0 },
      { type: 'item', index: 1 },
      { type: 'seccion', key: 'c', index: 2, section: 'Precios Jornada Adicional', number: 2 },
      { type: 'item', index: 2 },
    ])
  })

  it('un ítem sin sección entre dos grupos lleva su propio encabezado, como en el PDF', () => {
    expect(rowsGrid([item('a', 'X'), item('b'), item('c', 'X')]).filter((row) => row.type === 'seccion')).toEqual([
      { type: 'seccion', key: 'a', index: 0, section: 'X', number: 1 },
      { type: 'seccion', key: 'b', index: 1, section: '', number: 2 },
      { type: 'seccion', key: 'c', index: 2, section: 'X', number: 3 },
    ])
  })
})

describe('leerCantidad', () => {
  it('entiende la coma decimal y exige más de 0', () => {
    expect(readQuantity('1')).toBe(1)
    expect(readQuantity('2,5')).toBe(2.5)
    expect(readQuantity('0')).toBeNull()
    expect(readQuantity('')).toBeNull()
    expect(readQuantity('-1')).toBeNull()
    expect(readQuantity('dos')).toBeNull()
  })
})

describe('normalizarPrecio', () => {
  it('muestra con formato lo que se escribió o pegó, sin "$"', () => {
    expect(normalizePrice('39000000')).toBe('39.000.000,00')
    expect(normalizePrice('39.000.000')).toBe('39.000.000,00')
    expect(normalizePrice('39.000.000,00')).toBe('39.000.000,00')
    expect(normalizePrice('$ 1.950.000.-')).toBe('1.950.000,00')
    expect(normalizePrice('2.5')).toBe('2,50')
  })

  it('lo que no es un monto queda como está (lo marca la validación)', () => {
    expect(normalizePrice(' abc ')).toBe('abc')
    expect(normalizePrice('39000000\t5000')).toBe('39000000\t5000')
    expect(normalizePrice('  ')).toBe('')
  })
})

describe('totalLinea', () => {
  it('cantidad por precio, redondeado a centavos', () => {
    expect(totalLine({ cantidad: '2', precio: '1.950.000,00' })).toBe(3_900_000)
    expect(totalLine({ cantidad: '1,5', precio: '100,10' })).toBe(150.15)
  })

  it('sin precio o con una cantidad inválida no hay total', () => {
    expect(totalLine({ cantidad: '1', precio: '' })).toBeNull()
    expect(totalLine({ cantidad: '0', precio: '10' })).toBeNull()
  })
})

describe('totalGeneral', () => {
  it('suma solo si todos los ítems tienen total, y cuenta los que no tienen precio', () => {
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b', '', '1', '195.000')])).toEqual({
      total: 4_095_000,
      withoutPrice: 0,
    })
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b')])).toEqual({ total: null, withoutPrice: 1 })
    expect(totalGeneral([item('a', '', '0', '10')])).toEqual({ total: null, withoutPrice: 0 })
    expect(totalGeneral([])).toEqual({ total: null, withoutPrice: 0 })
  })
})

describe('nombreSeccionNueva', () => {
  it('numera después de los grupos que hay, sin repetir un nombre', () => {
    expect(nameSectionNew([item('a', 'Precios Jornada'), item('b', 'Precios Jornada Adicional')])).toBe('Sección 3')
    expect(nameSectionNew([item('a', 'Sección 2')])).toBe('Sección 3')
    expect(nameSectionNew([item('a'), item('b')])).toBe('Sección 2')
    expect(nameSectionNew([])).toBe('Sección 1')
  })
})

describe('destinoFoco', () => {
  const items = [item('a', 'X'), item('b', 'X'), item('c', 'Y'), item('d', 'Y')]

  it('la fila siguiente (después de agregar con Enter o duplicar)', () => {
    expect(focusDestination({ type: 'siguiente', key: 'a' }, items)).toEqual({ key: 'b', field: 'descripcion' })
    expect(focusDestination({ type: 'siguiente', key: 'd' }, items)).toBeNull()
    expect(focusDestination({ type: 'siguiente', key: 'z' }, items)).toBeNull()
  })

  it('una fila puntual, la última o el nombre de la última sección', () => {
    expect(focusDestination({ type: 'item', key: 'c' }, items)).toEqual({ key: 'c', field: 'descripcion' })
    expect(focusDestination({ type: 'item', key: 'z' }, items)).toBeNull()
    expect(focusDestination({ type: 'ultimo' }, items)).toEqual({ key: 'd', field: 'descripcion' })
    expect(focusDestination({ type: 'ultimo' }, [])).toBeNull()
    expect(focusDestination({ type: 'seccionUltima' }, items)).toEqual({ key: 'c', field: 'seccion' })
  })
})

describe('vecinoAlQuitar', () => {
  it('el anterior; si era el primero, el siguiente; si era el único, ninguno', () => {
    const items = [item('a'), item('b'), item('c')]
    expect(neighborOnRemove(items, 'b')).toBe('a')
    expect(neighborOnRemove(items, 'a')).toBe('b')
    expect(neighborOnRemove([item('a')], 'a')).toBeNull()
    expect(neighborOnRemove(items, 'z')).toBeNull()
  })
})

describe('erroresPorClave', () => {
  it('pasa las rutas por posición a la clave del ítem enviado en esa posición', () => {
    const errors = {
      cliente: 'Elegí el cliente',
      'items.0.precio': 'Precio inválido',
      'items.2.descripcion': 'Falta la descripción',
      'items.2.cantidad': 'La cantidad tiene que ser mayor a 0',
      'items.1.seccion': 'Máximo 100 caracteres',
    }
    expect(errorsByKey(errors, ['a', 'b', 'c'])).toEqual({
      a: { precio: 'Precio inválido' },
      b: { seccion: 'Máximo 100 caracteres' },
      c: { descripcion: 'Falta la descripción', cantidad: 'La cantidad tiene que ser mayor a 0' },
    })
  })

  it('ignora las rutas que no son de una celda y las posiciones que no existen', () => {
    expect(errorsByKey({ 'items.3.precio': 'x', 'bloques.0.titulo': 'y', 'items.0.otro': 'z' }, ['a'])).toEqual({})
    expect(errorsByKey({}, ['a'])).toEqual({})
  })
})
