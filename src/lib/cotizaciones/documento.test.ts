import { describe, expect, it } from 'vitest'
import { armarDocumento, valoresVariables } from './documento'
import { EJEMPLO_JORNADA, EJEMPLO_MENSUAL } from './ejemplos'

describe('valoresVariables', () => {
  it('toma valores del equipo, la cotización, sus datos y, si faltan, de la empresa', () => {
    expect(valoresVariables(EJEMPLO_MENSUAL)).toMatchObject({
      numero: '112523',
      capacidad: '70',
      validez_dias: '30',
      ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41',
      indice_base: 'junio 2026',
      proxima_actualizacion: 'noviembre de 2026',
    })
  })

  it('formatea capacidades con decimales a la argentina', () => {
    const fuente = { ...EJEMPLO_JORNADA, equipo: { capacidad_tn: 60.5, descripcion: 'x' } }
    expect(valoresVariables(fuente).capacidad).toBe('60,5')
  })

  it('los datos de la cotización pisan los valores por defecto de la empresa', () => {
    const fuente = {
      ...EJEMPLO_MENSUAL,
      cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, datos: { ...(EJEMPLO_MENSUAL.cotizacion.datos as object), indice_base: 'octubre 2026' } },
    }
    expect(valoresVariables(fuente).indice_base).toBe('octubre 2026')
  })
})

describe('armarDocumento', () => {
  it('arma el encabezado, destinatario e ítems de la mensual', () => {
    const doc = armarDocumento(EJEMPLO_MENSUAL)
    expect(doc.encabezadoFecha).toBe('Neuquén, 15 de julio de 2026.')
    expect(doc.destinatario).toEqual({
      razonSocial: 'Milicic S.A.',
      cuit: null,
      atencion: 'Yanina Colman',
      email: 'yanina.colman@milicic.com.ar',
    })
    expect(doc.items[0]).toEqual({
      orden: 1,
      seccion: '',
      descripcion: 'Alquiler mensual Grúa 70 TN',
      cantidad: 1,
      precioUnitario: 39_000_000,
      unidad: 'UNIDAD',
      total: 39_000_000,
    })
    expect(doc.total).toBeNull()
    expect(doc.faltantes).toEqual([])
  })

  it('resuelve variables dentro de los bloques y parsea el formato', () => {
    const condiciones = armarDocumento(EJEMPLO_MENSUAL).bloques[0]
    expect(condiciones.titulo).toBe('CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR')
    expect(condiciones.nodos[0]).toEqual({
      tipo: 'vineta',
      nivel: 1,
      segmentos: [
        {
          texto:
            'El precio corresponde a una jornada de lunes a sábado de 8 a 18 hs, grúa de 70 TN con operador calificado para realizar servicios en Sargento Vidal Ruta Nacional 151 km 41.',
          negrita: false,
        },
      ],
    })
    expect(condiciones.nodos[3]).toMatchObject({ tipo: 'vineta', nivel: 2 })
  })

  it('arma el asunto y el CUIT de la por jornada', () => {
    const doc = armarDocumento(EJEMPLO_JORNADA)
    expect(doc.asunto).toBe('Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario.cuit).toBe('30-71952967-0')
    expect(doc.encabezadoFecha).toBe('Neuquén, 22 de octubre de 2026.')
  })

  it('informa las variables sin valor y las deja visibles', () => {
    const fuente = {
      ...EJEMPLO_JORNADA,
      cotizacion: { ...EJEMPLO_JORNADA.cotizacion, datos: { ...(EJEMPLO_JORNADA.cotizacion.datos as object), ubicacion: '' } },
    }
    const doc = armarDocumento(fuente)
    expect(doc.faltantes).toEqual(['ubicacion'])
    expect(doc.intro).toContain('{{ubicacion}}')
  })

  it('sin equipo, capacidad y descripción quedan como faltantes', () => {
    expect(armarDocumento({ ...EJEMPLO_JORNADA, equipo: null }).faltantes).toEqual(
      expect.arrayContaining(['capacidad', 'equipo_descripcion']),
    )
  })

  it('calcula el total solo si se pide y todos los ítems tienen precio', () => {
    const conTotal = { ...EJEMPLO_JORNADA, cotizacion: { ...EJEMPLO_JORNADA.cotizacion, mostrar_total: true } }
    expect(armarDocumento(conTotal).total).toBe(7_280_000)

    const sinPrecio = { ...conTotal, items: [...conTotal.items, { ...conTotal.items[0], orden: 4, precio_unitario: null }] }
    expect(armarDocumento(sinPrecio).total).toBeNull()
  })

  it('arma el pie con los datos de la empresa', () => {
    expect(armarDocumento(EJEMPLO_JORNADA).pie).toEqual({
      linea: 'T. Planas 5168 - Neuquén - Argentina - Tel. 0299 - 6019931 - equipos@equipospatagonicos.com.ar',
      web: 'www.equipospatagonicos.com.ar',
    })
  })
})
