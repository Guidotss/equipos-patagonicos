import { describe, expect, it } from 'vitest'
import { buildDocument, valuesVariables } from './document'
import { EXAMPLE_DAILY, EXAMPLE_MONTHLY } from './examples'

describe('valoresVariables', () => {
  it('toma valores del equipo, la cotización, sus datos y, si faltan, de la empresa', () => {
    expect(valuesVariables(EXAMPLE_MONTHLY)).toMatchObject({
      numero: '112523',
      capacidad: '70',
      validez_dias: '30',
      ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41',
      indice_base: 'junio 2026',
      proxima_actualizacion: 'noviembre de 2026',
    })
  })

  it('formatea capacidades con decimales a la argentina', () => {
    const source = { ...EXAMPLE_DAILY, equipo: { capacidad_tn: 60.5, descripcion: 'x' } }
    expect(valuesVariables(source).capacidad).toBe('60,5')
  })

  it('los datos de la cotización pisan los valores por defecto de la empresa', () => {
    const source = {
      ...EXAMPLE_MONTHLY,
      cotizacion: { ...EXAMPLE_MONTHLY.cotizacion, datos: { ...(EXAMPLE_MONTHLY.cotizacion.datos as object), indice_base: 'octubre 2026' } },
    }
    expect(valuesVariables(source).indice_base).toBe('octubre 2026')
  })
})

describe('armarDocumento', () => {
  it('arma el encabezado, destinatario e ítems de la mensual', () => {
    const doc = buildDocument(EXAMPLE_MONTHLY)
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
      priceUnitario: 39_000_000,
      unidad: 'UNIDAD',
      total: 39_000_000,
    })
    expect(doc.total).toBeNull()
    expect(doc.faltantes).toEqual([])
    expect(doc.desconocidas).toEqual([])
  })

  it('resuelve variables dentro de los bloques y parsea el formato', () => {
    const condiciones = buildDocument(EXAMPLE_MONTHLY).bloques[0]
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
    const doc = buildDocument(EXAMPLE_DAILY)
    expect(doc.asunto).toBe('Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario.cuit).toBe('30-71952967-0')
    expect(doc.encabezadoFecha).toBe('Neuquén, 22 de octubre de 2026.')
  })

  it('informa las variables sin valor y las deja visibles', () => {
    const source = {
      ...EXAMPLE_DAILY,
      cotizacion: { ...EXAMPLE_DAILY.cotizacion, datos: { ...(EXAMPLE_DAILY.cotizacion.datos as object), ubicacion: '' } },
    }
    const doc = buildDocument(source)
    expect(doc.faltantes).toEqual(['ubicacion'])
    expect(doc.intro).toContain('{{ubicacion}}')
  })

  it('informa las variables mal escritas en cualquier texto y las deja visibles', () => {
    const source = {
      ...EXAMPLE_DAILY,
      cotizacion: {
        ...EXAMPLE_DAILY.cotizacion,
        asunto: 'Cotización N° {{numero}} de {{ Capacidad }} TN',
        intro: 'Servicios en {{ubicación}}.',
        bloques: [
          { titulo: 'Plazo {{plazo entrega}}', contenido: '- Pago: {{forma**_pago}}\n  - Lugar: {{ubicacion}}' },
        ],
      },
      items: [{ ...EXAMPLE_DAILY.items[0], descripcion: 'Jornada {{equipo}}' }],
    }
    const doc = buildDocument(source)
    expect([...doc.desconocidas].sort()).toEqual(['Capacidad', 'equipo', 'forma**_pago', 'plazo entrega', 'ubicación'])
    expect(doc.faltantes).toEqual([])
    expect(doc.asunto).toBe('Cotización N° 112711 de {{ Capacidad }} TN')
    expect(doc.intro).toBe('Servicios en {{ubicación}}.')
    expect(buildDocument(EXAMPLE_DAILY).desconocidas).toEqual([])
  })

  it('los valores cargados no cambian el formato del bloque', () => {
    const source = {
      ...EXAMPLE_MONTHLY,
      cotizacion: {
        ...EXAMPLE_MONTHLY.cotizacion,
        datos: { ...(EXAMPLE_MONTHLY.cotizacion.datos as object), forma_pago: '30 **días' },
      },
      equipo: { capacidad_tn: 70, descripcion: 'Grúa XCMG 70 TN\nCertificada OAA\n- pluma 60 m' },
    }
    const nodos = buildDocument(source).bloques[0].nodos
    expect(nodos).toHaveLength(7)
    expect(nodos[3]).toEqual({
      tipo: 'vineta',
      nivel: 2,
      segmentos: [{ texto: 'Grúa XCMG 70 TN\nCertificada OAA\n- pluma 60 m', negrita: false }],
    })
    expect(nodos[6]).toEqual({
      tipo: 'vineta',
      nivel: 1,
      segmentos: [{ texto: 'Condiciones de pago: 30 **días.', negrita: false }],
    })
  })

  it('sin número (cotización sin guardar), {{numero}} queda como faltante', () => {
    const doc = buildDocument({ ...EXAMPLE_DAILY, cotizacion: { ...EXAMPLE_DAILY.cotizacion, numero: null } })
    expect(doc.numero).toBeNull()
    expect(doc.faltantes).toEqual(['numero'])
    expect(doc.asunto).toBe('Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
  })

  it('sin equipo, capacidad y descripción quedan como faltantes', () => {
    expect(buildDocument({ ...EXAMPLE_DAILY, equipo: null }).faltantes).toEqual(
      expect.arrayContaining(['capacidad', 'equipo_descripcion']),
    )
  })

  it('calcula el total solo si se pide y todos los ítems tienen precio', () => {
    const withTotal = { ...EXAMPLE_DAILY, cotizacion: { ...EXAMPLE_DAILY.cotizacion, mostrar_total: true } }
    expect(buildDocument(withTotal).total).toBe(7_280_000)

    const withoutPrice = { ...withTotal, items: [...withTotal.items, { ...withTotal.items[0], orden: 4, precio_unitario: null }] }
    expect(buildDocument(withoutPrice).total).toBeNull()
  })

  it('no deja punto doble cuando el valor de la variable ya termina en punto', () => {
    const doc = buildDocument(EXAMPLE_DAILY) // forma_pago = 'a 30 - 45 días F.F.' y la plantilla agrega '.'
    const last = doc.bloques.at(-1)!
    const texto = last.nodos.flatMap((nodo) => nodo.segmentos.map((s) => s.texto)).join('')
    expect(texto).toContain('a 30 - 45 días F.F.')
    expect(texto).not.toContain('F.F..')
  })

  it('respeta los puntos suspensivos', () => {
    const source = { ...EXAMPLE_DAILY, cotizacion: { ...EXAMPLE_DAILY.cotizacion, intro: 'Texto... sigue' } }
    expect(buildDocument(source).intro).toBe('Texto... sigue')
  })

  it('no dibuja los bloques ocultos ni cuenta sus variables', () => {
    const source = {
      ...EXAMPLE_DAILY,
      cotizacion: {
        ...EXAMPLE_DAILY.cotizacion,
        // Sin horario ni duración: las dos variables solo aparecen en "Alcance", que queda oculto.
        datos: { ...(EXAMPLE_DAILY.cotizacion.datos as object), horario: '', duracion_estimada: '' },
        bloques: [
          ...EXAMPLE_DAILY.cotizacion.bloques.map((block) =>
            block.titulo === 'Alcance' ? { ...block, hidden: true } : block,
          ),
          { titulo: 'Notas {{ubicación}}', contenido: '- {{plazo entrega}}', hidden: true },
        ],
      },
    }
    const doc = buildDocument(source)
    expect(doc.bloques.map((block) => block.titulo)).toEqual(['Equipo ofrecido', ''])
    expect(doc.faltantes).toEqual([])
    expect(doc.desconocidas).toEqual([])
  })

  it('un bloque con oculto en false se dibuja igual que uno sin la marca', () => {
    const source = {
      ...EXAMPLE_DAILY,
      cotizacion: {
        ...EXAMPLE_DAILY.cotizacion,
        bloques: EXAMPLE_DAILY.cotizacion.bloques.map((block) => ({ ...block, hidden: false })),
      },
    }
    expect(buildDocument(source).bloques).toEqual(buildDocument(EXAMPLE_DAILY).bloques)
  })

  it('arma el pie con los datos de la empresa', () => {
    expect(buildDocument(EXAMPLE_DAILY).pie).toEqual({
      line: 'T. Planas 5168 - Neuquén - Argentina - Tel. 0299 - 6019931 - equipos@equipospatagonicos.com.ar',
      web: 'www.equipospatagonicos.com.ar',
    })
  })
})
