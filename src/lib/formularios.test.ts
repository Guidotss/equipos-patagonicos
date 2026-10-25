import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { erroresPorRuta, exito, falloBase, falloValidacion, leerCampos, valorCampo } from './formularios'

describe('leerCampos', () => {
  it('lee los campos pedidos y usa "" para los que faltan o son archivos', () => {
    const fd = new FormData()
    fd.set('nombre', 'Julio')
    fd.set('archivo', new Blob(['x']))
    expect(leerCampos(fd, ['nombre', 'cargo', 'archivo'] as const)).toEqual({ nombre: 'Julio', cargo: '', archivo: '' })
  })
})

describe('falloValidacion', () => {
  it('devuelve el primer mensaje de cada campo y conserva lo que escribió el usuario', () => {
    const esquema = z.object({ nombre: z.string().min(1, 'Ingresá el nombre'), email: z.email('Email inválido') })
    const valores = { nombre: '', email: 'x' }
    const resultado = esquema.safeParse(valores)
    if (resultado.success) throw new Error('debería fallar')

    expect(falloValidacion(resultado.error, valores)).toEqual({
      ok: false,
      mensaje: 'Revisá los datos marcados',
      errores: { nombre: 'Ingresá el nombre', email: 'Email inválido' },
      valores,
    })
  })
})

describe('erroresPorRuta', () => {
  const esquema = z.object({
    cliente: z.string().min(1, 'Elegí el cliente'),
    items: z.array(
      z.object({
        descripcion: z.string().min(1, 'Falta la descripción'),
        precio: z.number('Precio inválido').nonnegative('El precio no puede ser negativo'),
      }),
    ),
    datos: z.object({ ubicacion: z.string().max(3, 'Máximo 3 caracteres') }),
  })

  function errores(valor: unknown) {
    const resultado = esquema.safeParse(valor)
    if (resultado.success) throw new Error('debería fallar')
    return erroresPorRuta(resultado.error)
  }

  it('usa la ruta completa como clave, con los índices de las listas', () => {
    expect(
      errores({
        cliente: '',
        items: [
          { descripcion: 'Jornada', precio: 1 },
          { descripcion: '', precio: -1 },
          { descripcion: 'Viaje', precio: 'abc' },
        ],
        datos: { ubicacion: 'Neuquén' },
      }),
    ).toEqual({
      cliente: 'Elegí el cliente',
      'items.1.descripcion': 'Falta la descripción',
      'items.1.precio': 'El precio no puede ser negativo',
      'items.2.precio': 'Precio inválido',
      'datos.ubicacion': 'Máximo 3 caracteres',
    })
  })

  it('se queda con el primer mensaje de cada ruta', () => {
    const doble = z.object({ nombre: z.string().min(3, 'Muy corto').regex(/^[a-z]+$/, 'Solo minúsculas') })
    const resultado = doble.safeParse({ nombre: 'A' })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ nombre: 'Muy corto' })
  })

  it('un error del objeto entero queda con la clave vacía', () => {
    const conRegla = z
      .object({ desde: z.number(), hasta: z.number() })
      .refine((rango) => rango.desde <= rango.hasta, 'Rango invertido')
    const resultado = conRegla.safeParse({ desde: 2, hasta: 1 })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ '': 'Rango invertido' })
  })

  it('una ruta con nombre de propiedad heredada no choca con el objeto', () => {
    const raro = z.object({ constructor: z.string('Texto requerido') })
    const resultado = raro.safeParse({ constructor: 1 })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ constructor: 'Texto requerido' })
  })
})

describe('falloBase', () => {
  const valores = { cuit: '30719529670' }

  it('traduce los códigos de Postgres a mensajes', () => {
    expect(falloBase({ code: '23505', message: 'dup' }, valores).mensaje).toBe('Ya existe un registro con esos datos')
    expect(falloBase({ code: '42501', message: 'rls' }, valores).mensaje).toBe(
      'No tenés permiso para hacer esta operación',
    )
    expect(falloBase({ code: 'P0001', message: 'Mensaje de la regla' }, valores).mensaje).toBe('Mensaje de la regla')
    expect(falloBase({ code: 'XX000', message: 'raro' }, valores).mensaje).toBe(
      'No se pudo guardar. Probá de nuevo en un momento.',
    )
    expect(falloBase({ code: '22003', message: 'overflow' }, valores).mensaje).toBe('Algún número es demasiado grande')
  })

  it('marca el campo cuando el duplicado tiene un campo asociado', () => {
    const resultado = falloBase({ code: '23505', message: 'dup' }, valores, {
      campo: 'cuit',
      mensaje: 'Ya existe un cliente con ese CUIT',
    })
    expect(resultado.errores).toEqual({ cuit: 'Ya existe un cliente con ese CUIT' })
    expect(resultado.valores).toEqual(valores)
  })
})

describe('exito', () => {
  it('arma un estado ok', () => {
    expect(exito('Guardado')).toEqual({ ok: true, mensaje: 'Guardado', errores: {} })
  })
})

describe('valorCampo', () => {
  it('prioriza lo que envió el usuario, después el valor inicial y por último ""', () => {
    const estado = { ok: false, mensaje: null, errores: {}, valores: { nombre: 'Escrito' } }
    expect(valorCampo(estado, { nombre: 'Inicial', cargo: 'Jefe' }, 'nombre')).toBe('Escrito')
    expect(valorCampo({ ok: false, mensaje: null, errores: {} }, { cargo: 'Jefe' }, 'cargo')).toBe('Jefe')
    expect(valorCampo({ ok: false, mensaje: null, errores: {} }, undefined, 'cargo')).toBe('')
  })
})
