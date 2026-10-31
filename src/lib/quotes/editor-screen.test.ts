import { describe, expect, it } from 'vitest'
import { statusNew, reduceEditor, type StatusEditor, type TemplateEditor } from './editor'
import {
  changesOfContent,
  fieldsDataVisible,
  contactInitial,
  errorsOfBlocks,
  errorsWithoutField,
  isSaveShortcut,
  isDateIso,
  defaultSigner,
  idFieldVariable,
  sameName,
  headerSummary,
  textNextUpdate,
} from './editor-screen'

const TEMPLATE: TemplateEditor = {
  id: '6f1c1d2e-0000-4000-8000-000000000001',
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} grúa de {{capacidad}} TN',
  intro: 'Servicios de izaje en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', hidden: false },
    { titulo: 'Renegociación', contenido: 'Con base en {{indice_base}}.', hidden: false },
  ],
  items: [{ seccion: 'Precios Jornada', descripcion: 'Jornada de grúa', unidad: 'JORNADA', cantidad: 1 }],
}

const CLIENT = {
  id: '6f1c1d2e-0000-4000-8000-000000000002',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}

/** Una cotización nueva con la plantilla aplicada y un cliente elegido. */
function newQuote(): StatusEditor {
  const state = statusNew({ plantilla: TEMPLATE, firmanteId: '', today: '2026-10-25' })
  return reduceEditor(state, { tipo: 'cliente', cliente: CLIENT, contactoId: '' })
}

const SIGNERS = [
  { id: 'a', nombre: 'Thomas Cravero', cargo: '', telefono: '', activo: true },
  { id: 'b', nombre: 'Julio Rojas', cargo: '', telefono: '', activo: true },
  { id: 'c', nombre: 'Ana Inactiva', cargo: '', telefono: '', activo: false },
]

describe('firmantePorDefecto', () => {
  it('es el de la última cotización si sigue activo', () => {
    expect(defaultSigner(SIGNERS, 'a')).toBe('a')
  })

  it('si no, el primero activo por nombre; sin firmantes activos, ninguno', () => {
    expect(defaultSigner(SIGNERS, 'c')).toBe('b')
    expect(defaultSigner(SIGNERS, null)).toBe('b')
    expect(defaultSigner([], null)).toBe('')
  })
})

describe('contactoInicial', () => {
  const contacts = [
    { id: 'x', nombre: 'Yanina Colman', email: '' },
    { id: 'y', nombre: 'Carlos Díaz', email: '' },
  ]

  it('el último usado si sigue siendo del cliente; si no, el primero por nombre', () => {
    expect(contactInitial(contacts, 'x')).toBe('x')
    expect(contactInitial(contacts, 'otro')).toBe('y')
    expect(contactInitial(contacts, null)).toBe('y')
  })

  it('sin contactos queda "Sin Atte."', () => {
    expect(contactInitial([], null)).toBe('')
  })
})

describe('camposDatosVisibles', () => {
  it('muestra los campos que usa el texto visible, en el orden de CAMPOS_DATOS', () => {
    expect(fieldsDataVisible(newQuote())).toEqual(['ubicacion', 'horario', 'indice_base'])
  })

  it('un bloque oculto no cuenta', () => {
    const state = newQuote()
    const hidden = reduceEditor(state, { tipo: 'bloque', clave: state.bloques[1].clave, changes: { hidden: true } })
    expect(fieldsDataVisible(hidden)).toEqual(['ubicacion', 'horario'])
  })

  it('un campo con valor se sigue mostrando aunque el texto no lo use', () => {
    const withValue = reduceEditor(newQuote(), { tipo: 'dato', campo: 'forma_pago', value: '30 días F.F.' })
    expect(fieldsDataVisible(withValue)).toEqual(['ubicacion', 'horario', 'forma_pago', 'indice_base'])
  })
})

describe('idCampoVariable', () => {
  it('lleva cada variable al campo donde se completa', () => {
    expect(idFieldVariable('ubicacion')).toBe('cotizacion-dato-ubicacion')
    expect(idFieldVariable('capacidad')).toBe('cotizacion-equipo')
    expect(idFieldVariable('equipo_descripcion')).toBe('cotizacion-equipo')
    expect(idFieldVariable('validez_dias')).toBe('cotizacion-validez')
    expect(idFieldVariable('proxima_actualizacion')).toBe('cotizacion-proxima-actualizacion')
    expect(idFieldVariable('numero')).toBeNull()
  })
})

describe('textoProximaActualizacion', () => {
  it('el mes elegido, el texto que ya tenía o el de la empresa', () => {
    expect(textNextUpdate('2026-11', 'marzo de 2027', 'junio de 2027')).toBe('noviembre de 2026')
    expect(textNextUpdate('', 'marzo de 2027', 'junio de 2027')).toBe('marzo de 2027')
    expect(textNextUpdate('', '', 'junio de 2027')).toBe('junio de 2027')
  })

  it('un año a medio escribir (Chrome pasa por 0002-11) no rompe: queda el texto que había', () => {
    expect(textNextUpdate('0002-11', 'marzo de 2027', 'junio de 2027')).toBe('marzo de 2027')
  })
})

describe('esFechaIso', () => {
  it('solo fechas que existen', () => {
    expect(isDateIso('2026-10-25')).toBe(true)
    expect(isDateIso('2026-02-30')).toBe(false)
    expect(isDateIso('')).toBe(false)
  })
})

describe('resumenEncabezado', () => {
  it('una nueva todavía no tiene número', () => {
    expect(headerSummary(newQuote(), '2026-10-25')).toEqual({
      title: 'Nueva cotización',
      detail: 'Por jornada · 25/10/2026',
      expiration: null,
    })
  })

  it('"Vence el" solo en enviadas; el día del vencimiento todavía no está vencida', () => {
    const sent = { ...newQuote(), numero: 112712, estado: 'enviada' as const, fecha: '2026-10-01', validezDias: '30' }
    expect(headerSummary(sent, '2026-10-31').expiration).toEqual({ text: 'Vence el 31/10/2026', expired: false })
    expect(headerSummary(sent, '2026-11-01').expiration).toEqual({ text: 'Venció el 31/10/2026', expired: true })
    expect(headerSummary({ ...sent, estado: 'borrador' }, '2026-11-01')).toMatchObject({
      title: 'Cotización N° 112712',
      expiration: null,
    })
  })

  it('una fecha o una validez inválidas no rompen el encabezado', () => {
    const invalid = { ...newQuote(), estado: 'enviada' as const, fecha: '', validezDias: 'abc' }
    expect(headerSummary(invalid, '2026-10-25')).toEqual({ title: 'Nueva cotización', detail: 'Por jornada', expiration: null })
  })
})

describe('cambiosDeContenido', () => {
  it('recién aplicada la plantilla no hay nada que pisar', () => {
    expect(changesOfContent(newQuote(), TEMPLATE)).toBe(false)
  })

  it('los datos y el cliente no cuentan: la plantilla no los toca', () => {
    expect(changesOfContent(reduceEditor(newQuote(), { tipo: 'dato', campo: 'ubicacion', value: 'Añelo' }), TEMPLATE)).toBe(
      false,
    )
  })

  it('el asunto o un precio escritos a mano sí', () => {
    const state = newQuote()
    expect(changesOfContent(reduceEditor(state, { tipo: 'campo', campo: 'asunto', value: 'Otro' }), TEMPLATE)).toBe(true)
    const withPrice = reduceEditor(state, { tipo: 'item', clave: state.items[0].clave, changes: { precio: '1.950.000' } })
    expect(changesOfContent(withPrice, TEMPLATE)).toBe(true)
  })

  it('sin plantilla actual, hay cambios si hay algo escrito', () => {
    const empty = { ...newQuote(), asunto: '', intro: '', items: [], bloques: [] }
    expect(changesOfContent(empty, null)).toBe(false)
    expect(changesOfContent({ ...empty, intro: 'Hola' }, null)).toBe(true)
  })
})

describe('erroresSinCampo', () => {
  it('devuelve solo los mensajes que no tienen un campo donde mostrarse', () => {
    expect(
      errorsWithoutField({
        cliente: 'Elegí el cliente',
        'items.0.precio': 'Precio inválido',
        'datos.ubicacion': 'Máximo 500 caracteres',
        'bloques.1.contenido': 'Muy largo',
        notas: 'Algo raro',
      }),
    ).toEqual(['Algo raro'])
  })
})

describe('erroresDeBloques', () => {
  it('pasa las rutas por posición a la clave de cada bloque que se mandó a guardar', () => {
    const errors = {
      'bloques.0.titulo': 'Máximo 200 caracteres',
      'bloques.2.contenido': 'Máximo 10.000 caracteres',
      'bloques.2.titulo': 'Máximo 200 caracteres',
      'items.0.precio': 'Precio inválido',
      cliente: 'Elegí el cliente',
    }
    expect(errorsOfBlocks(errors, ['a', 'b', 'c'])).toEqual({
      a: { titulo: 'Máximo 200 caracteres' },
      c: { contenido: 'Máximo 10.000 caracteres', titulo: 'Máximo 200 caracteres' },
    })
  })

  it('ignora una posición que no estaba en lo que se mandó', () => {
    expect(errorsOfBlocks({ 'bloques.3.contenido': 'Muy largo' }, ['a'])).toEqual({})
  })
})

describe('esAtajoGuardar', () => {
  const key = (key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  })

  it('Ctrl+S o ⌘+S, también con Mayús', () => {
    expect(isSaveShortcut(key('s', { ctrlKey: true }))).toBe(true)
    expect(isSaveShortcut(key('s', { metaKey: true }))).toBe(true)
    expect(isSaveShortcut(key('S', { ctrlKey: true }))).toBe(true)
  })

  it('no con Alt, sin Ctrl/⌘ ni con otra tecla', () => {
    expect(isSaveShortcut(key('s', { ctrlKey: true, altKey: true }))).toBe(false)
    expect(isSaveShortcut(key('s'))).toBe(false)
    expect(isSaveShortcut(key('Enter', { ctrlKey: true }))).toBe(false)
  })
})

describe('mismoNombre', () => {
  it('ignora tildes, mayúsculas y espacios de más', () => {
    expect(sameName('Grúas  Ñandú S.A.', 'gruas nandu s.a. ')).toBe(true)
    expect(sameName('Grúas Ñandú S.A.', 'Grúas Ñandú S.R.L.')).toBe(false)
  })
})
