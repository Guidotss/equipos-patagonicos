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
})

describe('esquemaItem', () => {
  it('acepta un ítem sin precio (borrador) y rechaza precios negativos o unidades desconocidas', () => {
    expect(esquemaItem.parse({ descripcion: 'Jornada', cantidad: 1, precio_unitario: null, unidad: 'JORNADA' }).seccion).toBe('')
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: -1, unidad: 'HORA' }).success).toBe(false)
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: 1, unidad: 'LITRO' }).success).toBe(false)
  })
})
