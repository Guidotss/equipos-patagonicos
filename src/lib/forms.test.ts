import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorsByPath, success, databaseFailure, validationFailure, readFields, valueField } from './forms'

describe('leerCampos', () => {
  it('lee los campos pedidos y usa "" para los que faltan o son archivos', () => {
    const fd = new FormData()
    fd.set('nombre', 'Julio')
    fd.set('archivo', new Blob(['x']))
    expect(readFields(fd, ['nombre', 'cargo', 'archivo'] as const)).toEqual({ nombre: 'Julio', cargo: '', archivo: '' })
  })
})

describe('falloValidacion', () => {
  it('devuelve el primer mensaje de cada campo y conserva lo que escribió el usuario', () => {
    const schema = z.object({ nombre: z.string().min(1, 'Ingresá el nombre'), email: z.email('Email inválido') })
    const values = { nombre: '', email: 'x' }
    const result = schema.safeParse(values)
    if (result.success) throw new Error('debería fallar')

    expect(validationFailure(result.error, values)).toEqual({
      ok: false,
      message: 'Revisá los datos marcados',
      errors: { nombre: 'Ingresá el nombre', email: 'Email inválido' },
      values,
    })
  })
})

describe('erroresPorRuta', () => {
  const schema = z.object({
    cliente: z.string().min(1, 'Elegí el cliente'),
    items: z.array(
      z.object({
        descripcion: z.string().min(1, 'Falta la descripción'),
        precio: z.number('Precio inválido').nonnegative('El precio no puede ser negativo'),
      }),
    ),
    datos: z.object({ ubicacion: z.string().max(3, 'Máximo 3 caracteres') }),
  })

  function errors(value: unknown) {
    const result = schema.safeParse(value)
    if (result.success) throw new Error('debería fallar')
    return errorsByPath(result.error)
  }

  it('usa la ruta completa como clave, con los índices de las listas', () => {
    expect(
      errors({
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
    const result = doble.safeParse({ nombre: 'A' })
    if (result.success) throw new Error('debería fallar')
    expect(errorsByPath(result.error)).toEqual({ nombre: 'Muy corto' })
  })

  it('un error del objeto entero queda con la clave vacía', () => {
    const withRegla = z
      .object({ desde: z.number(), hasta: z.number() })
      .refine((rango) => rango.desde <= rango.hasta, 'Rango invertido')
    const result = withRegla.safeParse({ desde: 2, hasta: 1 })
    if (result.success) throw new Error('debería fallar')
    expect(errorsByPath(result.error)).toEqual({ '': 'Rango invertido' })
  })

  it('una ruta con nombre de propiedad heredada no choca con el objeto', () => {
    const raro = z.object({ constructor: z.string('Texto requerido') })
    const result = raro.safeParse({ constructor: 1 })
    if (result.success) throw new Error('debería fallar')
    expect(errorsByPath(result.error)).toEqual({ constructor: 'Texto requerido' })
  })
})

describe('falloBase', () => {
  const values = { cuit: '30719529670' }

  it('traduce los códigos de Postgres a mensajes', () => {
    expect(databaseFailure({ code: '23505', message: 'dup' }, values).message).toBe('Ya existe un registro con esos datos')
    expect(databaseFailure({ code: '42501', message: 'rls' }, values).message).toBe(
      'No tenés permiso para hacer esta operación',
    )
    expect(databaseFailure({ code: 'P0001', message: 'Mensaje de la regla' }, values).message).toBe('Mensaje de la regla')
    expect(databaseFailure({ code: 'XX000', message: 'raro' }, values).message).toBe(
      'No se pudo guardar. Probá de nuevo en un momento.',
    )
    expect(databaseFailure({ code: '22003', message: 'overflow' }, values).message).toBe('Algún número es demasiado grande')
  })

  it('marca el campo cuando el duplicado tiene un campo asociado', () => {
    const result = databaseFailure({ code: '23505', message: 'dup' }, values, {
      campo: 'cuit',
      message: 'Ya existe un cliente con ese CUIT',
    })
    expect(result.errors).toEqual({ cuit: 'Ya existe un cliente con ese CUIT' })
    expect(result.values).toEqual(values)
  })
})

describe('exito', () => {
  it('arma un estado ok', () => {
    expect(success('Guardado')).toEqual({ ok: true, message: 'Guardado', errors: {} })
  })
})

describe('valorCampo', () => {
  it('prioriza lo que envió el usuario, después el valor inicial y por último ""', () => {
    const estado = { ok: false, message: null, errors: {}, values: { nombre: 'Escrito' } }
    expect(valueField(estado, { nombre: 'Inicial', cargo: 'Jefe' }, 'nombre')).toBe('Escrito')
    expect(valueField({ ok: false, message: null, errors: {} }, { cargo: 'Jefe' }, 'cargo')).toBe('Jefe')
    expect(valueField({ ok: false, message: null, errors: {} }, undefined, 'cargo')).toBe('')
  })
})
