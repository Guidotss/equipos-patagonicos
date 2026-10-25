import { describe, expect, it } from 'vitest'
import { esquemaItem, leerDatos } from './datos'

describe('leerDatos', () => {
  it('completa con "" las claves faltantes y recorta espacios', () => {
    expect(leerDatos({ ubicacion: '  Ruta 7  ' })).toEqual({
      ubicacion: 'Ruta 7',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    })
    expect(leerDatos(null).forma_pago).toBe('')
  })

  it('leer no falla con valores largos o de otro tipo (la validación es al guardar)', () => {
    const datos = leerDatos({ ubicacion: 'x'.repeat(600), horario: 8, forma_pago: null })
    expect(datos.ubicacion).toHaveLength(600)
    expect(datos.horario).toBe('')
    expect(datos.forma_pago).toBe('')
  })
})

describe('esquemaItem', () => {
  it('acepta un ítem sin precio (borrador) y rechaza precios negativos o unidades desconocidas', () => {
    expect(esquemaItem.parse({ descripcion: 'Jornada', cantidad: 1, precio_unitario: null, unidad: 'JORNADA' }).seccion).toBe('')
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: -1, unidad: 'HORA' }).success).toBe(false)
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: 1, unidad: 'LITRO' }).success).toBe(false)
  })

  it('explica cada error en castellano', () => {
    const resultado = esquemaItem.safeParse({
      seccion: 'x'.repeat(101),
      descripcion: 'x'.repeat(501),
      cantidad: 1_000_000,
      precio_unitario: 1_000_000_000_000,
      unidad: 'LITRO',
    })
    expect(resultado.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['seccion', 'Máximo 100 caracteres'],
      ['descripcion', 'Máximo 500 caracteres'],
      ['cantidad', 'La cantidad es demasiado grande'],
      ['precio_unitario', 'El precio es demasiado grande'],
      ['unidad', 'Elegí la unidad'],
    ])
  })
})
