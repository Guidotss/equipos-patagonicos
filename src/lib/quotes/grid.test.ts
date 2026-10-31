// src/lib/cotizaciones/grilla.test.ts
import { describe, expect, it } from 'vitest'
import {
  destinoFoco,
  erroresPorClave,
  filasGrilla,
  leerCantidad,
  nombreSeccionNueva,
  normalizarPrecio,
  totalGeneral,
  totalLinea,
  vecinoAlQuitar,
} from './grilla'

const item = (clave: string, seccion = '', cantidad = '1', precio = '') => ({ clave, seccion, cantidad, precio })

describe('filasGrilla', () => {
  it('sin secciones son solo ítems', () => {
    expect(filasGrilla([item('a'), item('b')])).toEqual([
      { tipo: 'item', indice: 0 },
      { tipo: 'item', indice: 1 },
    ])
  })

  it('un encabezado por cada grupo consecutivo, con la clave y el índice de su primer ítem', () => {
    expect(
      filasGrilla([item('a', 'Precios Jornada'), item('b', 'Precios Jornada'), item('c', 'Precios Jornada Adicional')]),
    ).toEqual([
      { tipo: 'seccion', clave: 'a', indice: 0, seccion: 'Precios Jornada', numero: 1 },
      { tipo: 'item', indice: 0 },
      { tipo: 'item', indice: 1 },
      { tipo: 'seccion', clave: 'c', indice: 2, seccion: 'Precios Jornada Adicional', numero: 2 },
      { tipo: 'item', indice: 2 },
    ])
  })

  it('un ítem sin sección entre dos grupos lleva su propio encabezado, como en el PDF', () => {
    expect(filasGrilla([item('a', 'X'), item('b'), item('c', 'X')]).filter((fila) => fila.tipo === 'seccion')).toEqual([
      { tipo: 'seccion', clave: 'a', indice: 0, seccion: 'X', numero: 1 },
      { tipo: 'seccion', clave: 'b', indice: 1, seccion: '', numero: 2 },
      { tipo: 'seccion', clave: 'c', indice: 2, seccion: 'X', numero: 3 },
    ])
  })
})

describe('leerCantidad', () => {
  it('entiende la coma decimal y exige más de 0', () => {
    expect(leerCantidad('1')).toBe(1)
    expect(leerCantidad('2,5')).toBe(2.5)
    expect(leerCantidad('0')).toBeNull()
    expect(leerCantidad('')).toBeNull()
    expect(leerCantidad('-1')).toBeNull()
    expect(leerCantidad('dos')).toBeNull()
  })
})

describe('normalizarPrecio', () => {
  it('muestra con formato lo que se escribió o pegó, sin "$"', () => {
    expect(normalizarPrecio('39000000')).toBe('39.000.000,00')
    expect(normalizarPrecio('39.000.000')).toBe('39.000.000,00')
    expect(normalizarPrecio('39.000.000,00')).toBe('39.000.000,00')
    expect(normalizarPrecio('$ 1.950.000.-')).toBe('1.950.000,00')
    expect(normalizarPrecio('2.5')).toBe('2,50')
  })

  it('lo que no es un monto queda como está (lo marca la validación)', () => {
    expect(normalizarPrecio(' abc ')).toBe('abc')
    expect(normalizarPrecio('39000000\t5000')).toBe('39000000\t5000')
    expect(normalizarPrecio('  ')).toBe('')
  })
})

describe('totalLinea', () => {
  it('cantidad por precio, redondeado a centavos', () => {
    expect(totalLinea({ cantidad: '2', precio: '1.950.000,00' })).toBe(3_900_000)
    expect(totalLinea({ cantidad: '1,5', precio: '100,10' })).toBe(150.15)
  })

  it('sin precio o con una cantidad inválida no hay total', () => {
    expect(totalLinea({ cantidad: '1', precio: '' })).toBeNull()
    expect(totalLinea({ cantidad: '0', precio: '10' })).toBeNull()
  })
})

describe('totalGeneral', () => {
  it('suma solo si todos los ítems tienen total, y cuenta los que no tienen precio', () => {
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b', '', '1', '195.000')])).toEqual({
      total: 4_095_000,
      sinPrecio: 0,
    })
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b')])).toEqual({ total: null, sinPrecio: 1 })
    expect(totalGeneral([item('a', '', '0', '10')])).toEqual({ total: null, sinPrecio: 0 })
    expect(totalGeneral([])).toEqual({ total: null, sinPrecio: 0 })
  })
})

describe('nombreSeccionNueva', () => {
  it('numera después de los grupos que hay, sin repetir un nombre', () => {
    expect(nombreSeccionNueva([item('a', 'Precios Jornada'), item('b', 'Precios Jornada Adicional')])).toBe('Sección 3')
    expect(nombreSeccionNueva([item('a', 'Sección 2')])).toBe('Sección 3')
    expect(nombreSeccionNueva([item('a'), item('b')])).toBe('Sección 2')
    expect(nombreSeccionNueva([])).toBe('Sección 1')
  })
})

describe('destinoFoco', () => {
  const items = [item('a', 'X'), item('b', 'X'), item('c', 'Y'), item('d', 'Y')]

  it('la fila siguiente (después de agregar con Enter o duplicar)', () => {
    expect(destinoFoco({ tipo: 'siguiente', clave: 'a' }, items)).toEqual({ clave: 'b', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'siguiente', clave: 'd' }, items)).toBeNull()
    expect(destinoFoco({ tipo: 'siguiente', clave: 'z' }, items)).toBeNull()
  })

  it('una fila puntual, la última o el nombre de la última sección', () => {
    expect(destinoFoco({ tipo: 'item', clave: 'c' }, items)).toEqual({ clave: 'c', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'item', clave: 'z' }, items)).toBeNull()
    expect(destinoFoco({ tipo: 'ultimo' }, items)).toEqual({ clave: 'd', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'ultimo' }, [])).toBeNull()
    expect(destinoFoco({ tipo: 'seccionUltima' }, items)).toEqual({ clave: 'c', campo: 'seccion' })
  })
})

describe('vecinoAlQuitar', () => {
  it('el anterior; si era el primero, el siguiente; si era el único, ninguno', () => {
    const items = [item('a'), item('b'), item('c')]
    expect(vecinoAlQuitar(items, 'b')).toBe('a')
    expect(vecinoAlQuitar(items, 'a')).toBe('b')
    expect(vecinoAlQuitar([item('a')], 'a')).toBeNull()
    expect(vecinoAlQuitar(items, 'z')).toBeNull()
  })
})

describe('erroresPorClave', () => {
  it('pasa las rutas por posición a la clave del ítem enviado en esa posición', () => {
    const errores = {
      cliente: 'Elegí el cliente',
      'items.0.precio': 'Precio inválido',
      'items.2.descripcion': 'Falta la descripción',
      'items.2.cantidad': 'La cantidad tiene que ser mayor a 0',
      'items.1.seccion': 'Máximo 100 caracteres',
    }
    expect(erroresPorClave(errores, ['a', 'b', 'c'])).toEqual({
      a: { precio: 'Precio inválido' },
      b: { seccion: 'Máximo 100 caracteres' },
      c: { descripcion: 'Falta la descripción', cantidad: 'La cantidad tiene que ser mayor a 0' },
    })
  })

  it('ignora las rutas que no son de una celda y las posiciones que no existen', () => {
    expect(erroresPorClave({ 'items.3.precio': 'x', 'bloques.0.titulo': 'y', 'items.0.otro': 'z' }, ['a'])).toEqual({})
    expect(erroresPorClave({}, ['a'])).toEqual({})
  })
})
