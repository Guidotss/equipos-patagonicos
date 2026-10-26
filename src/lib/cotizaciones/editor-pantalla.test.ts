import { describe, expect, it } from 'vitest'
import { estadoNuevo, reducirEditor, type EstadoEditor, type PlantillaEditor } from './editor'
import {
  cambiosDeContenido,
  camposDatosVisibles,
  contactoInicial,
  erroresSinCampo,
  esFechaIso,
  firmantePorDefecto,
  idCampoVariable,
  mismoNombre,
  resumenEncabezado,
  textoProximaActualizacion,
} from './editor-pantalla'

const PLANTILLA: PlantillaEditor = {
  id: '6f1c1d2e-0000-4000-8000-000000000001',
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} grúa de {{capacidad}} TN',
  intro: 'Servicios de izaje en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', oculto: false },
    { titulo: 'Renegociación', contenido: 'Con base en {{indice_base}}.', oculto: false },
  ],
  items: [{ seccion: 'Precios Jornada', descripcion: 'Jornada de grúa', unidad: 'JORNADA', cantidad: 1 }],
}

const CLIENTE = {
  id: '6f1c1d2e-0000-4000-8000-000000000002',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}

/** Una cotización nueva con la plantilla aplicada y un cliente elegido. */
function nueva(): EstadoEditor {
  const estado = estadoNuevo({ plantilla: PLANTILLA, firmanteId: '', hoy: '2026-10-25' })
  return reducirEditor(estado, { tipo: 'cliente', cliente: CLIENTE, contactoId: '' })
}

const FIRMANTES = [
  { id: 'a', nombre: 'Thomas Cravero', cargo: '', telefono: '', activo: true },
  { id: 'b', nombre: 'Julio Rojas', cargo: '', telefono: '', activo: true },
  { id: 'c', nombre: 'Ana Inactiva', cargo: '', telefono: '', activo: false },
]

describe('firmantePorDefecto', () => {
  it('es el de la última cotización si sigue activo', () => {
    expect(firmantePorDefecto(FIRMANTES, 'a')).toBe('a')
  })

  it('si no, el primero activo por nombre; sin firmantes activos, ninguno', () => {
    expect(firmantePorDefecto(FIRMANTES, 'c')).toBe('b')
    expect(firmantePorDefecto(FIRMANTES, null)).toBe('b')
    expect(firmantePorDefecto([], null)).toBe('')
  })
})

describe('contactoInicial', () => {
  const contactos = [
    { id: 'x', nombre: 'Yanina Colman', email: '' },
    { id: 'y', nombre: 'Carlos Díaz', email: '' },
  ]

  it('el último usado si sigue siendo del cliente; si no, el primero por nombre', () => {
    expect(contactoInicial(contactos, 'x')).toBe('x')
    expect(contactoInicial(contactos, 'otro')).toBe('y')
    expect(contactoInicial(contactos, null)).toBe('y')
  })

  it('sin contactos queda "Sin Atte."', () => {
    expect(contactoInicial([], null)).toBe('')
  })
})

describe('camposDatosVisibles', () => {
  it('muestra los campos que usa el texto visible, en el orden de CAMPOS_DATOS', () => {
    expect(camposDatosVisibles(nueva())).toEqual(['ubicacion', 'horario', 'indice_base'])
  })

  it('un bloque oculto no cuenta', () => {
    const estado = nueva()
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(camposDatosVisibles(oculto)).toEqual(['ubicacion', 'horario'])
  })

  it('un campo con valor se sigue mostrando aunque el texto no lo use', () => {
    const conValor = reducirEditor(nueva(), { tipo: 'dato', campo: 'forma_pago', valor: '30 días F.F.' })
    expect(camposDatosVisibles(conValor)).toEqual(['ubicacion', 'horario', 'forma_pago', 'indice_base'])
  })
})

describe('idCampoVariable', () => {
  it('lleva cada variable al campo donde se completa', () => {
    expect(idCampoVariable('ubicacion')).toBe('cotizacion-dato-ubicacion')
    expect(idCampoVariable('capacidad')).toBe('cotizacion-equipo')
    expect(idCampoVariable('equipo_descripcion')).toBe('cotizacion-equipo')
    expect(idCampoVariable('validez_dias')).toBe('cotizacion-validez')
    expect(idCampoVariable('proxima_actualizacion')).toBe('cotizacion-proxima-actualizacion')
    expect(idCampoVariable('numero')).toBeNull()
  })
})

describe('textoProximaActualizacion', () => {
  it('el mes elegido, el texto que ya tenía o el de la empresa', () => {
    expect(textoProximaActualizacion('2026-11', 'marzo de 2027', 'junio de 2027')).toBe('noviembre de 2026')
    expect(textoProximaActualizacion('', 'marzo de 2027', 'junio de 2027')).toBe('marzo de 2027')
    expect(textoProximaActualizacion('', '', 'junio de 2027')).toBe('junio de 2027')
  })

  it('un año a medio escribir (Chrome pasa por 0002-11) no rompe: queda el texto que había', () => {
    expect(textoProximaActualizacion('0002-11', 'marzo de 2027', 'junio de 2027')).toBe('marzo de 2027')
  })
})

describe('esFechaIso', () => {
  it('solo fechas que existen', () => {
    expect(esFechaIso('2026-10-25')).toBe(true)
    expect(esFechaIso('2026-02-30')).toBe(false)
    expect(esFechaIso('')).toBe(false)
  })
})

describe('resumenEncabezado', () => {
  it('una nueva todavía no tiene número', () => {
    expect(resumenEncabezado(nueva(), '2026-10-25')).toEqual({
      titulo: 'Nueva cotización',
      detalle: 'Por jornada · 25/10/2026',
      vence: null,
    })
  })

  it('"Vence el" solo en enviadas; el día del vencimiento todavía no está vencida', () => {
    const enviada = { ...nueva(), numero: 112712, estado: 'enviada' as const, fecha: '2026-10-01', validezDias: '30' }
    expect(resumenEncabezado(enviada, '2026-10-31').vence).toEqual({ texto: 'Vence el 31/10/2026', vencida: false })
    expect(resumenEncabezado(enviada, '2026-11-01').vence).toEqual({ texto: 'Venció el 31/10/2026', vencida: true })
    expect(resumenEncabezado({ ...enviada, estado: 'borrador' }, '2026-11-01')).toMatchObject({
      titulo: 'Cotización N° 112712',
      vence: null,
    })
  })

  it('una fecha o una validez inválidas no rompen el encabezado', () => {
    const rota = { ...nueva(), estado: 'enviada' as const, fecha: '', validezDias: 'abc' }
    expect(resumenEncabezado(rota, '2026-10-25')).toEqual({ titulo: 'Nueva cotización', detalle: 'Por jornada', vence: null })
  })
})

describe('cambiosDeContenido', () => {
  it('recién aplicada la plantilla no hay nada que pisar', () => {
    expect(cambiosDeContenido(nueva(), PLANTILLA)).toBe(false)
  })

  it('los datos y el cliente no cuentan: la plantilla no los toca', () => {
    expect(cambiosDeContenido(reducirEditor(nueva(), { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' }), PLANTILLA)).toBe(
      false,
    )
  })

  it('el asunto o un precio escritos a mano sí', () => {
    const estado = nueva()
    expect(cambiosDeContenido(reducirEditor(estado, { tipo: 'campo', campo: 'asunto', valor: 'Otro' }), PLANTILLA)).toBe(true)
    const conPrecio = reducirEditor(estado, { tipo: 'item', clave: estado.items[0].clave, cambios: { precio: '1.950.000' } })
    expect(cambiosDeContenido(conPrecio, PLANTILLA)).toBe(true)
  })

  it('sin plantilla actual, hay cambios si hay algo escrito', () => {
    const vacia = { ...nueva(), asunto: '', intro: '', items: [], bloques: [] }
    expect(cambiosDeContenido(vacia, null)).toBe(false)
    expect(cambiosDeContenido({ ...vacia, intro: 'Hola' }, null)).toBe(true)
  })
})

describe('erroresSinCampo', () => {
  it('devuelve solo los mensajes que no tienen un campo donde mostrarse', () => {
    expect(
      erroresSinCampo({
        cliente: 'Elegí el cliente',
        'items.0.precio': 'Precio inválido',
        'datos.ubicacion': 'Máximo 500 caracteres',
        'bloques.1.contenido': 'Muy largo',
        notas: 'Algo raro',
      }),
    ).toEqual(['Algo raro'])
  })
})

describe('mismoNombre', () => {
  it('ignora tildes, mayúsculas y espacios de más', () => {
    expect(mismoNombre('Grúas  Ñandú S.A.', 'gruas nandu s.a. ')).toBe(true)
    expect(mismoNombre('Grúas Ñandú S.A.', 'Grúas Ñandú S.R.L.')).toBe(false)
  })
})
