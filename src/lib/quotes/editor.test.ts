import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { todayArgentina } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import type { Database } from '@/lib/supabase/database.types'
import { buildDocument } from './document'
import {
  SELECT_EDITOR,
  applyTemplate,
  schemaStatusEditor,
  statusFromRow,
  statusNew,
  sourceFromEditor,
  hasChanges,
  newKey,
  payloadSave,
  pendingListEditor,
  canSend,
  reduceEditor,
  textQuantity,
  textPrice,
  type CatalogsEditor,
  type StatusEditor,
  type RowEditor,
  type ItemEditor,
  type PendingList,
  type TemplateEditor,
} from './editor'
import { EXAMPLE_DAILY } from './examples'

const ID = '5a8d1c2e-1f4b-4c3a-9e7d-2b6f8a9c0d11'
const CLIENTE = {
  id: '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}
const CONTACTO = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const EQUIPMENT_40 = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a'
const EQUIPMENT_70 = '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b'
const FIRMANTE = '3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c'
const TEMPLATE_DAILY_ID = '4a5b6c7d-8e9f-4a0b-9c2d-3e4f5a6b7c8d'
const TEMPLATE_MONTHLY_ID = '6c7d8e9f-0a1b-4c2d-8e4f-5a6b7c8d9e0f'
const ANTERIOR = '8e9f0a1b-2c3d-4e4f-9a6b-7c8d9e0f1a2b'

// Las plantillas de los datos iniciales, recortadas a lo que importa para estos tests.
const DESCRIPTIONS_DAILY = [
  'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)',
  'Movilización y desmovilización de Grúa Telescópica',
  'Jornadas diarias (8 hs) adicionales, domingos y feriados',
]

const TEMPLATE_DAILY: TemplateEditor = {
  id: TEMPLATE_DAILY_ID,
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
  intro: 'Alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para servicios de izajes en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', hidden: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.\nTiempo estimado: {{duracion_estimada}}.', hidden: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.', hidden: false },
  ],
  items: [
    { seccion: 'Precios Jornada', descripcion: DESCRIPTIONS_DAILY[0], unidad: 'JORNADA', cantidad: 1 },
    { seccion: 'Precios Jornada', descripcion: DESCRIPTIONS_DAILY[1], unidad: 'VIAJE', cantidad: 1 },
    { seccion: 'Precios Jornada Adicional', descripcion: DESCRIPTIONS_DAILY[2], unidad: 'JORNADA', cantidad: 1 },
  ],
}

const TEMPLATE_MONTHLY: TemplateEditor = {
  id: TEMPLATE_MONTHLY_ID,
  nombre: 'Mensual - Grúa con operador',
  formato: 'mensual',
  asunto: '',
  intro: '',
  validez_dias: 15,
  bloques: [
    { titulo: 'RENEGOCIACIÓN DE TARIFAS', contenido: 'Próxima actualización: {{proxima_actualizacion}}.', hidden: false },
  ],
  items: [{ seccion: '', descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', unidad: 'UNIDAD', cantidad: 1 }],
}

const CATALOGOS: CatalogsEditor = {
  plantillas: [TEMPLATE_MONTHLY, TEMPLATE_DAILY],
  equipos: [
    {
      id: EQUIPMENT_40,
      nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
      capacidad_tn: 40,
      descripcion: 'Grúa XCMG QY70K-1 de 40 TN.',
      activo: true,
    },
    { id: EQUIPMENT_70, nombre: 'Grúa XCMG 70 TN', capacidad_tn: 70, descripcion: 'Grúa XCMG de 70 TN.', activo: false },
  ],
  firmantes: [
    { id: FIRMANTE, nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985', activo: true },
  ],
  empresa: EXAMPLE_DAILY.empresa,
}

const DATA_COMPLETOS = {
  ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
  horario: '08:30 hs a 17:30 hs',
  plazo_entrega: '',
  duracion_estimada: '1 jornada',
  forma_pago: 'a 30 - 45 días F.F.',
  disponibilidad: 'a confirmar',
  indice_base: '',
  proxima_actualizacion: '',
}

/** Una por jornada nueva con todo completo y precios, lista para guardar. */
function complete(): StatusEditor {
  const estado = statusNew({ plantilla: TEMPLATE_DAILY, firmanteId: FIRMANTE, today: '2026-10-25' })
  const prices = ['1.950.000', '2.800.000', '2530000']
  return {
    ...estado,
    cliente: CLIENTE,
    contactoId: CONTACTO,
    equipoId: EQUIPMENT_40,
    datos: DATA_COMPLETOS,
    items: estado.items.map((item, index) => ({ ...item, precio: prices[index] })),
  }
}

/** El estado sin las claves (que son aleatorias), para comparar. */
function withoutKeys(estado: StatusEditor) {
  return {
    ...estado,
    items: estado.items.map(({ clave, ...item }) => ({ ...item, clave: typeof clave })),
    bloques: estado.bloques.map(({ clave, ...block }) => ({ ...block, clave: typeof clave })),
  }
}

function keys(items: { clave: string }[]) {
  return items.map((item) => item.clave)
}

function item(changes: Partial<ItemEditor>): ItemEditor {
  return { clave: newKey(), seccion: '', descripcion: 'Jornada', cantidad: '1', precio: '', unidad: 'JORNADA', ...changes }
}

function withItems(items: ItemEditor[]): StatusEditor {
  return { ...complete(), items }
}

function errors(estado: StatusEditor) {
  const result = payloadSave(estado)
  if (result.ok) throw new Error('debería fallar')
  return result.errors
}

function payload(estado: StatusEditor) {
  const result = payloadSave(estado)
  if (!result.ok) throw new Error(`no debería fallar: ${JSON.stringify(result.errors)}`)
  return result.payload
}

const FILA: RowEditor = {
  id: ID,
  numero: 112712,
  estado: 'enviada',
  origen: 'app',
  fecha: '2026-10-20',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}}',
  intro: 'Intro',
  datos: { ubicacion: '  Añelo ', horario: 8, otra: 'x' },
  bloques: [
    { titulo: 'Alcance', contenido: '- Item' },
    { titulo: 'Notas', contenido: 'Oculto', hidden: true },
  ],
  validez_dias: 15,
  mostrar_total: true,
  fecha_proxima_actualizacion: '2026-11-01',
  contacto_id: null,
  plantilla_id: TEMPLATE_DAILY_ID,
  equipo_id: EQUIPMENT_40,
  firmante_id: null,
  reemplaza_a: ANTERIOR,
  fecha_aprobacion: null,
  archivo_original_path: null,
  updated_at: '2026-10-20T15:04:05.123456+00:00',
  cliente: CLIENTE,
  items: [
    { orden: 2, seccion: 'Precios', descripcion: 'Movilización', cantidad: 1.5, precio_unitario: null, unidad: 'VIAJE' },
    { orden: 1, seccion: 'Precios', descripcion: 'Jornada', cantidad: 1, precio_unitario: 1_950_000.5, unidad: 'JORNADA' },
  ],
  envios: [{ id: '9f0a1b2c-3d4e-4f5a-8b7c-8d9e0f1a2b3c', enviada_at: '2026-10-21T10:00:00+00:00' }],
}

describe('FilaEditor', () => {
  it('encaja con lo que devuelve la consulta de SELECT_EDITOR (lo comprueba npm run typecheck)', () => {
    // No se ejecuta ninguna consulta: solo se compara el tipo que infiere supabase-js con FilaEditor.
    const consulta = (supabase: SupabaseClient<Database>) =>
      supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', ID).maybeSingle()
    expectTypeOf(consulta).returns.resolves.toHaveProperty('data').exclude<null>().toExtend<RowEditor>()
  })
})

describe('nuevaClave', () => {
  it('genera claves UUID distintas', () => {
    const [a, b] = [newKey(), newKey()]
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })

  it('sin crypto.randomUUID (el dev server abierto por la IP de la red, sin HTTPS) igual da claves distintas', () => {
    vi.stubGlobal('crypto', {})
    try {
      const [a, b] = [newKey(), newKey()]
      expect(a).not.toBe(b)
      expect(a).toMatch(/^[0-9a-z-]{1,64}$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('textoPrecio y textoCantidad', () => {
  it('escriben los números como se tipean en la grilla', () => {
    expect(textPrice(39_000_000)).toBe('39.000.000')
    expect(textPrice(1_950_000.5)).toBe('1.950.000,50')
    expect(textPrice(0)).toBe('0')
    expect(textQuantity(1)).toBe('1')
    expect(textQuantity(1.5)).toBe('1,5')
    expect(textQuantity(0.25)).toBe('0,25')
  })

  it.each([0, 1, 950, 1_950, 260_000, 1_950_000.5, 39_000_000, 999_999_999_999.99, 0.5])(
    'parsePrecio vuelve a leer el precio %d',
    (price) => {
      expect(parsePrice(textPrice(price))).toBe(price)
    },
  )

  it.each([1, 1.5, 2.25, 12, 1000, 999_999])('parsePrecio vuelve a leer la cantidad %d', (cantidad) => {
    expect(parsePrice(textQuantity(cantidad))).toBe(cantidad)
  })
})

describe('estadoNuevo', () => {
  it('con plantilla: borrador de la app con asunto, textos, validez e ítems sin precio', () => {
    const estado = statusNew({ plantilla: TEMPLATE_DAILY, firmanteId: FIRMANTE, today: '2026-10-25' })
    expect(withoutKeys(estado)).toEqual({
      id: null,
      version: null,
      numero: null,
      estado: 'borrador',
      origen: 'app',
      cliente: null,
      contactoId: '',
      templateId: TEMPLATE_DAILY_ID,
      formato: 'jornada',
      equipoId: '',
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      validezDias: '30',
      mostrarTotal: false,
      proximaActualizacion: '',
      asunto: TEMPLATE_DAILY.asunto,
      intro: TEMPLATE_DAILY.intro,
      datos: {
        ubicacion: '',
        horario: '',
        plazo_entrega: '',
        duracion_estimada: '',
        forma_pago: '',
        disponibilidad: '',
        indice_base: '',
        proxima_actualizacion: '',
      },
      items: TEMPLATE_DAILY.items.map((item) => ({
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: '1',
        precio: '',
        unidad: item.unidad,
        clave: 'string',
      })),
      bloques: TEMPLATE_DAILY.bloques.map((block) => ({ ...block, clave: 'string' })),
      replacesA: null,
    })
    expect(new Set([...keys(estado.items), ...keys(estado.bloques)]).size).toBe(6)
  })

  it('sin plantilla: vacía, mensual y con la validez por defecto de la base', () => {
    const estado = statusNew({ plantilla: null, firmanteId: '', today: '2026-10-25' })
    expect(estado).toMatchObject({ templateId: '', formato: 'mensual', validezDias: '30', items: [], bloques: [] })
  })
})

describe('estadoDesdeFila', () => {
  it('convierte la fila guardada al estado del editor', () => {
    expect(withoutKeys(statusFromRow(FILA))).toEqual({
      id: ID,
      version: '2026-10-20T15:04:05.123456+00:00',
      numero: 112712,
      estado: 'enviada',
      origen: 'app',
      cliente: CLIENTE,
      contactoId: '',
      templateId: TEMPLATE_DAILY_ID,
      formato: 'jornada',
      equipoId: EQUIPMENT_40,
      firmanteId: '',
      fecha: '2026-10-20',
      validezDias: '15',
      mostrarTotal: true,
      proximaActualizacion: '2026-11',
      asunto: 'Cotización N° {{numero}}',
      intro: 'Intro',
      datos: {
        ubicacion: 'Añelo',
        horario: '',
        plazo_entrega: '',
        duracion_estimada: '',
        forma_pago: '',
        disponibilidad: '',
        indice_base: '',
        proxima_actualizacion: '',
      },
      items: [
        { seccion: 'Precios', descripcion: 'Jornada', cantidad: '1', precio: '1.950.000,50', unidad: 'JORNADA', clave: 'string' },
        { seccion: 'Precios', descripcion: 'Movilización', cantidad: '1,5', precio: '', unidad: 'VIAJE', clave: 'string' },
      ],
      bloques: [
        { titulo: 'Alcance', contenido: '- Item', hidden: false, clave: 'string' },
        { titulo: 'Notas', contenido: 'Oculto', hidden: true, clave: 'string' },
      ],
      replacesA: ANTERIOR,
    })
  })

  it('sin fecha de próxima actualización el mes queda vacío', () => {
    expect(statusFromRow({ ...FILA, fecha_proxima_actualizacion: null }).proximaActualizacion).toBe('')
  })

  it('leer dos veces la misma fila no cuenta como cambio (las claves no importan)', () => {
    expect(hasChanges(statusFromRow(FILA), statusFromRow(FILA))).toBe(false)
  })

  it('un valor que la base no permite es un error de programación', () => {
    expect(() => statusFromRow({ ...FILA, estado: 'anulada' })).toThrow('Estado desconocido: anulada')
    expect(() => statusFromRow({ ...FILA, formato: 'semanal' })).toThrow('Formato desconocido: semanal')
    expect(() => statusFromRow({ ...FILA, items: [{ ...FILA.items[0], unidad: 'LITRO' }] })).toThrow(
      'Unidad desconocida: LITRO',
    )
    expect(() => statusFromRow({ ...FILA, bloques: [{ titulo: 1 }] })).toThrow()
  })
})

describe('aplicarPlantilla', () => {
  it('reemplaza formato, asunto, introducción, textos, validez e ítems; conserva lo demás', () => {
    const antes = { ...complete(), proximaActualizacion: '2026-11', mostrarTotal: true }
    const despues = applyTemplate(antes, TEMPLATE_MONTHLY)
    expect(despues).toMatchObject({
      templateId: TEMPLATE_MONTHLY_ID,
      formato: 'mensual',
      asunto: '',
      intro: '',
      validezDias: '15',
      cliente: CLIENTE,
      contactoId: CONTACTO,
      equipoId: EQUIPMENT_40,
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      datos: DATA_COMPLETOS,
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
    })
    expect(despues.items.map(({ descripcion, precio: price, unidad }) => ({ descripcion, precio: price, unidad }))).toEqual([
      { descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', precio: '', unidad: 'UNIDAD' },
    ])
    expect(despues.bloques.map((block) => block.titulo)).toEqual(['RENEGOCIACIÓN DE TARIFAS'])
  })
})

describe('reducirEditor', () => {
  it('campo: cambia el campo pedido sin tocar el estado anterior', () => {
    const antes = complete()
    const despues = reduceEditor(antes, { tipo: 'campo', campo: 'asunto', value: 'Otro asunto' })
    expect(despues.asunto).toBe('Otro asunto')
    expect(antes.asunto).toBe(TEMPLATE_DAILY.asunto)
    expect(reduceEditor(antes, { tipo: 'campo', campo: 'validezDias', value: '45' }).validezDias).toBe('45')
    const month = reduceEditor(antes, { tipo: 'campo', campo: 'proximaActualizacion', value: '2026-11' })
    expect(month.proximaActualizacion).toBe('2026-11')
    expect(reduceEditor(antes, { tipo: 'campo', campo: 'equipoId', value: '' }).equipoId).toBe('')
  })

  it('próxima actualización: el mes escribe también el texto del PDF y vaciarlo lo borra (decisión 7)', () => {
    const withText = { ...complete(), datos: { ...DATA_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    const month = reduceEditor(withText, { tipo: 'campo', campo: 'proximaActualizacion', value: '2026-11' })
    expect(month).toMatchObject({ proximaActualizacion: '2026-11', datos: { proxima_actualizacion: 'noviembre de 2026' } })
    const empty = reduceEditor(month, { tipo: 'campo', campo: 'proximaActualizacion', value: '' })
    expect(empty).toMatchObject({ proximaActualizacion: '', datos: { proxima_actualizacion: '' } })
    // Sin fecha ni texto, el PDF usa el de la empresa: lo mismo antes y después de recargar.
    expect(payload(empty).p_datos).toMatchObject({ fecha_proxima_actualizacion: null, datos: { proxima_actualizacion: '' } })
  })

  it('dato: cambia una variable de la cotización', () => {
    const despues = reduceEditor(complete(), { tipo: 'dato', campo: 'ubicacion', value: 'Añelo' })
    expect(despues.datos).toEqual({ ...DATA_COMPLETOS, ubicacion: 'Añelo' })
  })

  it('mostrarTotal', () => {
    expect(reduceEditor(complete(), { tipo: 'mostrarTotal', value: true }).mostrarTotal).toBe(true)
  })

  it('cliente: cambia el cliente y el contacto juntos', () => {
    const otro = { id: ANTERIOR, razon_social: 'Milicic S.A.', cuit: null }
    expect(reduceEditor(complete(), { tipo: 'cliente', cliente: otro, contactoId: '' })).toMatchObject({
      cliente: otro,
      contactoId: '',
    })
    expect(reduceEditor(complete(), { tipo: 'cliente', cliente: null, contactoId: '' }).cliente).toBeNull()
  })

  it('plantilla: aplica la plantilla', () => {
    const despues = reduceEditor(complete(), { tipo: 'plantilla', plantilla: TEMPLATE_MONTHLY })
    expect(despues).toMatchObject({ templateId: TEMPLATE_MONTHLY_ID, formato: 'mensual', validezDias: '15' })
  })

  describe('agregarItem', () => {
    it('sin referencia agrega al final copiando sección y unidad de la última fila', () => {
      const antes = complete()
      const despues = reduceEditor(antes, { tipo: 'agregarItem' })
      expect(despues.items).toHaveLength(4)
      expect(despues.items.slice(0, 3)).toEqual(antes.items)
      expect(despues.items[3]).toEqual({
        clave: expect.any(String),
        seccion: 'Precios Jornada Adicional',
        descripcion: '',
        cantidad: '1',
        precio: '',
        unidad: 'JORNADA',
      })
    })

    it('después de una fila: la agrega debajo, con su sección y su unidad', () => {
      const antes = complete()
      const despues = reduceEditor(antes, { tipo: 'agregarItem', despuesOf: antes.items[1].clave })
      expect(keys(despues.items).indexOf(antes.items[1].clave)).toBe(1)
      expect(despues.items[2]).toMatchObject({ seccion: 'Precios Jornada', unidad: 'VIAJE', descripcion: '' })
      expect(despues.items[3]).toEqual(antes.items[2])
    })

    it('con sección explícita la usa', () => {
      const despues = reduceEditor(complete(), { tipo: 'agregarItem', seccion: 'Otros' })
      expect(despues.items.at(-1)?.seccion).toBe('Otros')
    })

    it('con una fila que ya no existe agrega al final', () => {
      const despues = reduceEditor(complete(), { tipo: 'agregarItem', despuesOf: 'no-existe' })
      expect(despues.items).toHaveLength(4)
      expect(despues.items[3].descripcion).toBe('')
    })

    it('en una grilla vacía usa la unidad del formato', () => {
      const daily = { ...complete(), items: [] }
      expect(reduceEditor(daily, { tipo: 'agregarItem' }).items[0]).toMatchObject({ seccion: '', unidad: 'JORNADA' })
      const monthly = { ...daily, formato: 'mensual' as const }
      expect(reduceEditor(monthly, { tipo: 'agregarItem' }).items[0].unidad).toBe('UNIDAD')
    })
  })

  it('item: cambia solo esa fila y conserva su clave', () => {
    const antes = complete()
    const clave = antes.items[1].clave
    const despues = reduceEditor(antes, { tipo: 'item', clave, changes: { precio: '3.000.000', unidad: 'JORNADA' } })
    expect(despues.items[1]).toEqual({ ...antes.items[1], precio: '3.000.000', unidad: 'JORNADA' })
    expect(despues.items[0]).toBe(antes.items[0])
    const withKey = { precio: '1', clave: 'otra' } as Partial<Omit<ItemEditor, 'clave'>>
    expect(reduceEditor(antes, { tipo: 'item', clave, changes: withKey }).items[1].clave).toBe(clave)
  })

  describe('moverItem', () => {
    it('mueve una fila de lugar', () => {
      const antes = withItems([item({ descripcion: 'a' }), item({ descripcion: 'b' }), item({ descripcion: 'c' })])
      const despues = reduceEditor(antes, { tipo: 'moverItem', desde: 2, hasta: 0 })
      expect(despues.items.map((row) => row.descripcion)).toEqual(['c', 'a', 'b'])
    })

    it('fuera de rango o al mismo lugar no cambia nada', () => {
      const antes = withItems([item({}), item({})])
      expect(reduceEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 5 })).toBe(antes)
      expect(reduceEditor(antes, { tipo: 'moverItem', desde: -1, hasta: 0 })).toBe(antes)
      expect(reduceEditor(antes, { tipo: 'moverItem', desde: 1, hasta: 1 })).toBe(antes)
    })

    it('si cae en el medio de otro grupo, se suma a ese grupo', () => {
      const antes = withItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'B', descripcion: 'b2' }),
      ])
      const despues = reduceEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 1 })
      expect(despues.items.map((row) => `${row.seccion}:${row.descripcion}`)).toEqual(['B:b1', 'B:a1', 'B:b2'])
    })

    it('en el borde entre dos grupos conserva su sección', () => {
      const antes = withItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'A', descripcion: 'a2' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'C', descripcion: 'c1' }),
      ])
      const onFinal = reduceEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 3 })
      expect(onFinal.items.map((row) => `${row.seccion}:${row.descripcion}`)).toEqual([
        'A:a2',
        'B:b1',
        'C:c1',
        'A:a1',
      ])
      const betweenGroups = reduceEditor(antes, { tipo: 'moverItem', desde: 3, hasta: 2 })
      expect(betweenGroups.items.map((row) => row.seccion)).toEqual(['A', 'A', 'C', 'B'])
    })
  })

  it('quitarItem', () => {
    const antes = complete()
    const despues = reduceEditor(antes, { tipo: 'quitarItem', clave: antes.items[0].clave })
    expect(despues.items).toEqual(antes.items.slice(1))
  })

  it('con una clave que ya no existe, item, quitarItem y bloque devuelven el mismo estado', () => {
    const antes = complete()
    expect(reduceEditor(antes, { tipo: 'item', clave: 'no-existe', changes: { precio: '1' } })).toBe(antes)
    expect(reduceEditor(antes, { tipo: 'quitarItem', clave: 'no-existe' })).toBe(antes)
    expect(reduceEditor(antes, { tipo: 'bloque', clave: 'no-existe', changes: { hidden: true } })).toBe(antes)
  })

  it('duplicarItem: la copia va debajo con otra clave', () => {
    const antes = complete()
    const despues = reduceEditor(antes, { tipo: 'duplicarItem', clave: antes.items[0].clave })
    expect(despues.items).toHaveLength(4)
    expect(despues.items[1]).toEqual({ ...antes.items[0], clave: expect.any(String) })
    expect(despues.items[1].clave).not.toBe(antes.items[0].clave)
    expect(reduceEditor(antes, { tipo: 'duplicarItem', clave: 'no-existe' })).toBe(antes)
  })

  it('renombrarSeccion: renombra solo el grupo consecutivo de esa fila', () => {
    const antes = withItems([
      item({ seccion: 'A' }),
      item({ seccion: 'A' }),
      item({ seccion: 'B' }),
      item({ seccion: 'A' }),
    ])
    const despues = reduceEditor(antes, { tipo: 'renombrarSeccion', clave: antes.items[1].clave, seccion: 'Precios' })
    expect(despues.items.map((row) => row.seccion)).toEqual(['Precios', 'Precios', 'B', 'A'])
    expect(reduceEditor(antes, { tipo: 'renombrarSeccion', clave: 'no-existe', seccion: 'X' })).toBe(antes)
  })

  it('agregarSeccion: agrega una fila vacía en una sección nueva al final', () => {
    const despues = reduceEditor(complete(), { tipo: 'agregarSeccion', nombre: '  Horas extra ' })
    expect(despues.items.at(-1)).toMatchObject({ seccion: 'Horas extra', descripcion: '', unidad: 'JORNADA' })
    const withoutName = reduceEditor(complete(), { tipo: 'agregarSeccion', nombre: ' ' })
    expect(withoutName.items.at(-1)?.seccion).toBe('Nueva sección')
  })

  it('bloque: cambia texto u oculto de un bloque', () => {
    const antes = complete()
    const clave = antes.bloques[1].clave
    const despues = reduceEditor(antes, { tipo: 'bloque', clave, changes: { hidden: true } })
    expect(despues.bloques[1]).toEqual({ ...antes.bloques[1], hidden: true })
    expect(despues.bloques[0]).toBe(antes.bloques[0])
  })

  it('moverBloque: sube o baja uno; en los extremos no cambia', () => {
    const antes = complete()
    const [first, segundo, tercero] = keys(antes.bloques)
    expect(keys(reduceEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: -1 }).bloques)).toEqual([
      segundo,
      first,
      tercero,
    ])
    expect(keys(reduceEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: 1 }).bloques)).toEqual([
      first,
      tercero,
      segundo,
    ])
    expect(reduceEditor(antes, { tipo: 'moverBloque', clave: first, direccion: -1 })).toBe(antes)
    expect(reduceEditor(antes, { tipo: 'moverBloque', clave: tercero, direccion: 1 })).toBe(antes)
  })

  it('restaurarBloques: reemplaza los bloques por los dados, con claves nuevas', () => {
    const despues = reduceEditor(complete(), { tipo: 'restaurarBloques', bloques: TEMPLATE_MONTHLY.bloques })
    expect(despues.bloques).toEqual([{ ...TEMPLATE_MONTHLY.bloques[0], clave: expect.any(String) }])
  })

  it('guardado: anota id, versión y número sin tocar el contenido', () => {
    const antes = complete()
    const version = '2026-10-25T12:00:00+00:00'
    const despues = reduceEditor(antes, { tipo: 'guardado', id: ID, version, numero: 112713 })
    expect(despues).toEqual({ ...antes, id: ID, version, numero: 112713 })
  })

  it('reemplazar: devuelve el estado dado', () => {
    const otro = statusFromRow(FILA)
    expect(reduceEditor(complete(), { tipo: 'reemplazar', estado: otro })).toBe(otro)
  })
})

describe('hayCambios', () => {
  it('el mismo estado no tiene cambios', () => {
    const estado = complete()
    expect(hasChanges(estado, estado)).toBe(false)
  })

  it('cambiar algo y volverlo atrás', () => {
    const saved = complete()
    const edited = reduceEditor(saved, { tipo: 'dato', campo: 'ubicacion', value: 'Añelo' })
    expect(hasChanges(saved, edited)).toBe(true)
    const revertido = reduceEditor(edited, { tipo: 'dato', campo: 'ubicacion', value: DATA_COMPLETOS.ubicacion })
    expect(hasChanges(saved, revertido)).toBe(false)
  })

  it('lo que no cambia lo guardado no cuenta: formato del precio, espacios de más y el número asignado', () => {
    const saved = complete()
    const clave = saved.items[2].clave
    const price = reduceEditor(saved, { tipo: 'item', clave, changes: { precio: '2.530.000,00' } })
    expect(hasChanges(saved, price)).toBe(false)
    expect(hasChanges(saved, { ...saved, asunto: `${saved.asunto}  ` })).toBe(false)
    const withNumber = reduceEditor(saved, { tipo: 'guardado', id: ID, version: 'v2', numero: 112713 })
    expect(hasChanges(saved, withNumber)).toBe(false)
  })

  it('reordenar ítems u ocultar un bloque sí es un cambio', () => {
    const saved = complete()
    expect(hasChanges(saved, reduceEditor(saved, { tipo: 'moverItem', desde: 0, hasta: 1 }))).toBe(true)
    const clave = saved.bloques[0].clave
    expect(hasChanges(saved, reduceEditor(saved, { tipo: 'bloque', clave, changes: { hidden: true } }))).toBe(true)
  })

  it('con algo a medio escribir compara el contenido', () => {
    const saved = complete()
    const clave = saved.items[0].clave
    expect(hasChanges(saved, reduceEditor(saved, { tipo: 'item', clave, changes: { precio: 'abc' } }))).toBe(true)
    const nueva = statusNew({ plantilla: TEMPLATE_DAILY, firmanteId: FIRMANTE, today: '2026-10-25' })
    expect(hasChanges(nueva, nueva)).toBe(false)
    expect(hasChanges(nueva, reduceEditor(nueva, { tipo: 'campo', campo: 'asunto', value: 'x' }))).toBe(true)
  })
})

describe('payloadGuardar', () => {
  it('arma la cabecera completa y los ítems que espera guardar_cotizacion', () => {
    const estado: StatusEditor = {
      ...complete(),
      asunto: '  Cotización N° {{numero}}  ',
      validezDias: ' 45 ',
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
      replacesA: ANTERIOR,
      items: [
        item({ seccion: ' Precios Jornada ', descripcion: ' Jornada ', cantidad: '1,5', precio: '39.000.000,00' }),
        item({ seccion: '', descripcion: 'Movilización', cantidad: '2', precio: '', unidad: 'VIAJE' }),
      ],
    }
    expect(payload(estado)).toEqual({
      p_datos: {
        cliente_id: CLIENTE.id,
        contacto_id: CONTACTO,
        formato: 'jornada',
        plantilla_id: TEMPLATE_DAILY_ID,
        equipo_id: EQUIPMENT_40,
        firmante_id: FIRMANTE,
        fecha: '2026-10-25',
        asunto: 'Cotización N° {{numero}}',
        intro: TEMPLATE_DAILY.intro,
        datos: { ...DATA_COMPLETOS, proxima_actualizacion: 'noviembre de 2026' },
        bloques: TEMPLATE_DAILY.bloques,
        validez_dias: 45,
        mostrar_total: true,
        fecha_proxima_actualizacion: '2026-11-01',
        reemplaza_a: ANTERIOR,
      },
      p_items: [
        { seccion: 'Precios Jornada', descripcion: 'Jornada', cantidad: 1.5, precio_unitario: 39e6, unidad: 'JORNADA' },
        { seccion: '', descripcion: 'Movilización', cantidad: 2, precio_unitario: null, unidad: 'VIAJE' },
      ],
    })
  })

  it('los uuid vacíos van como null', () => {
    const datos = payload({ ...complete(), contactoId: '', equipoId: '', firmanteId: '', templateId: '' }).p_datos
    expect(datos).toMatchObject({ contacto_id: null, equipo_id: null, firmante_id: null, plantilla_id: null })
  })

  it('sin mes de actualización: la fecha va en null y se conserva el texto que hubiera', () => {
    const estado = { ...complete(), datos: { ...DATA_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    expect(payload(estado).p_datos).toMatchObject({
      fecha_proxima_actualizacion: null,
      datos: { proxima_actualizacion: 'marzo de 2027' },
    })
  })

  it('los bloques ocultos viajan con oculto: true y sin las claves', () => {
    const estado = complete()
    const hidden = reduceEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, changes: { hidden: true } })
    expect(payload(hidden).p_datos.bloques).toEqual([
      TEMPLATE_DAILY.bloques[0],
      { ...TEMPLATE_DAILY.bloques[1], hidden: true },
      TEMPLATE_DAILY.bloques[2],
    ])
  })

  it('el contenido de un bloque no se recorta (dos espacios al principio son una subviñeta)', () => {
    const estado = complete()
    const withSangria = reduceEditor(estado, {
      tipo: 'bloque',
      clave: estado.bloques[0].clave,
      changes: { titulo: '  Equipo  ', contenido: '  - Grúa\n' },
    })
    expect((payload(withSangria).p_datos.bloques as { titulo: string; contenido: string }[])[0]).toMatchObject({
      titulo: 'Equipo',
      contenido: '  - Grúa\n',
    })
  })

  it('una cotización sin ítems se puede guardar (borrador)', () => {
    expect(payload({ ...complete(), items: [] }).p_items).toEqual([])
  })

  it('exige el cliente', () => {
    expect(errors({ ...complete(), cliente: null })).toEqual({ cliente: 'Elegí el cliente' })
    expect(errors({ ...complete(), cliente: { ...CLIENTE, id: 'x' } })).toEqual({ cliente: 'Elegí el cliente' })
  })

  it.each(['', '0', '366', 'abc', '30.5', '-3'])('rechaza la validez %j', (validityDays) => {
    expect(errors({ ...complete(), validezDias: validityDays })).toEqual({ validezDias: 'Ingresá una validez de 1 a 365 días' })
  })

  it('valida fecha, mes, formato e identificadores', () => {
    expect(errors({ ...complete(), fecha: '2026-02-30' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errors({ ...complete(), fecha: '' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errors({ ...complete(), proximaActualizacion: '2026-13' })).toEqual({
      proximaActualizacion: 'Elegí un mes válido',
    })
    expect(errors({ ...complete(), formato: 'semanal' as never })).toEqual({ formato: 'Elegí el formato' })
    expect(errors({ ...complete(), equipoId: 'x', contactoId: 'y', replacesA: 'z' })).toEqual({
      equipoId: 'Equipo inválido',
      contactoId: 'Contacto inválido',
      replacesA: 'Cotización anterior inválida',
    })
  })

  it('marca cada celda con error con su fila', () => {
    const estado = withItems([
      item({ descripcion: 'Bien', precio: '100' }),
      item({ descripcion: '  ', cantidad: '', precio: 'abc' }),
      item({ cantidad: '0', precio: '-5' }),
      item({ cantidad: 'dos', precio: '1.000.000.000.000' }),
      item({ unidad: 'LITRO' as never }),
    ])
    expect(errors(estado)).toEqual({
      'items.1.descripcion': 'Falta la descripción',
      'items.1.cantidad': 'Ingresá la cantidad',
      'items.1.precio': 'Precio inválido',
      'items.2.cantidad': 'La cantidad tiene que ser mayor a 0',
      'items.2.precio': 'Precio inválido',
      'items.3.cantidad': 'Cantidad inválida',
      'items.3.precio': 'El precio es demasiado grande',
      'items.4.unidad': 'Elegí la unidad',
    })
  })

  it('rechaza una fila cuyo total no entra en la base', () => {
    const estado = withItems([item({ cantidad: '999.999', precio: '999.999.999' })])
    expect(errors(estado)).toEqual({ 'items.0.precio': 'El total de la fila es demasiado grande' })
  })

  it('valida el largo de los datos y los textos', () => {
    const largo = 'x'.repeat(501)
    expect(errors({ ...complete(), asunto: largo, datos: { ...DATA_COMPLETOS, ubicacion: largo } })).toEqual({
      asunto: 'Máximo 500 caracteres',
      'datos.ubicacion': 'Máximo 500 caracteres',
    })
  })

  it('junta todos los errores a la vez', () => {
    const estado = { ...complete(), cliente: null, validezDias: '', items: [item({ descripcion: '' })] }
    expect(Object.keys(errors(estado))).toEqual(['cliente', 'validezDias', 'items.0.descripcion'])
  })

  it('no explota con datos mal formados (la Server Action recibe lo que mande el navegador)', () => {
    const broken = { ...complete(), items: 'nada', bloques: null, datos: 3 } as unknown as StatusEditor
    expect(Object.keys(errors(broken))).toEqual(['datos', 'items', 'bloques'])
    expect(errors(null as unknown as StatusEditor)).toHaveProperty('')
  })
})

describe('esquemaEstadoEditor', () => {
  it('acepta el CUIT textual del cliente sin limitarlo al formato fiscal', () => {
    const estado = { ...complete(), cliente: { ...CLIENTE, cuit: 'identificación informada por el cliente' } }
    expect(schemaStatusEditor.parse(estado).cliente?.cuit).toBe(estado.cliente.cuit)
  })

  it('acepta cualquier estado que arma el editor, aunque no se pueda guardar', () => {
    const nueva = statusNew({ plantilla: TEMPLATE_DAILY, firmanteId: '', today: '2026-10-25' })
    expect(schemaStatusEditor.parse(nueva)).toEqual(nueva)
    const leida = statusFromRow(FILA)
    expect(schemaStatusEditor.parse(leida)).toEqual(leida)
    const aMedias = { ...complete(), fecha: '', validezDias: 'x', items: [item({ precio: 'abc', cantidad: '' })] }
    expect(schemaStatusEditor.safeParse(aMedias).success).toBe(true)
  })

  it('rechaza lo que no es un estado del editor', () => {
    const estado = complete()
    for (const broken of [
      null,
      { ...estado, items: 'nada' },
      { ...estado, cliente: { ...CLIENTE, id: 'x' } },
      { ...estado, equipoId: 'x' },
      { ...estado, estado: 'anulada' },
      { ...estado, items: [{ ...estado.items[0], unidad: 'LITRO' }] },
      { ...estado, intro: 'x'.repeat(20_001) },
      { ...estado, items: Array.from({ length: 501 }, () => item({})) },
    ]) {
      expect(schemaStatusEditor.safeParse(broken).success).toBe(false)
    }
  })
})

describe('fuenteDesdeEditor', () => {
  it('arma el documento con los catálogos, el contacto y el estado sin guardar', () => {
    const estado = { ...complete(), numero: 112713, proximaActualizacion: '2026-12' }
    const source = sourceFromEditor(estado, CATALOGOS, { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' })
    expect(source).toEqual({
      cotizacion: {
        numero: 112713,
        fecha: '2026-10-25',
        formato: 'jornada',
        asunto: TEMPLATE_DAILY.asunto,
        intro: TEMPLATE_DAILY.intro,
        validez_dias: 30,
        mostrar_total: false,
        datos: { ...DATA_COMPLETOS, proxima_actualizacion: 'diciembre de 2026' },
        bloques: TEMPLATE_DAILY.bloques,
      },
      items: TEMPLATE_DAILY.items.map((item, index) => ({
        orden: index + 1,
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: 1,
        precio_unitario: [1_950_000, 2_800_000, 2_530_000][index],
        unidad: item.unidad,
      })),
      cliente: { razon_social: CLIENTE.razon_social, cuit: CLIENTE.cuit },
      contacto: { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' },
      equipo: { capacidad_tn: 40, descripcion: 'Grúa XCMG QY70K-1 de 40 TN.' },
      firmante: { nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985' },
      empresa: EXAMPLE_DAILY.empresa,
    })
    const doc = buildDocument(source)
    expect(doc.asunto).toBe('Cotización N° 112713 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario).toMatchObject({ cuit: '30-71952967-0', atencion: 'Yanina Colman' })
  })

  it('lo que está a medio escribir no rompe el documento', () => {
    const estado = {
      ...complete(),
      cliente: null,
      fecha: '',
      validezDias: '',
      equipoId: 'no-existe',
      items: [item({ cantidad: 'x', precio: 'y' })],
    }
    const source = sourceFromEditor(estado, CATALOGOS, null)
    expect(source.cotizacion).toMatchObject({ fecha: todayArgentina(), validez_dias: 0, numero: null })
    expect(source.items[0]).toMatchObject({ cantidad: 1, precio_unitario: null })
    expect(source).toMatchObject({ cliente: { razon_social: '', cuit: null }, equipo: null })
    expect(() => buildDocument(source)).not.toThrow()
  })
})

describe('pendientesEditor y puedeEnviar', () => {
  const guardada = (estado: StatusEditor): StatusEditor => ({ ...estado, id: ID, numero: 112713 })

  it('una cotización completa no tiene pendientes y se puede enviar', () => {
    const pendingList = pendingListEditor(guardada(complete()), CATALOGOS)
    expect(pendingList).toEqual({ variables: [], desconocidas: [], itemsWithoutPrice: 0, withoutItems: false })
    expect(canSend(pendingList)).toBe(true)
  })

  it('sin guardar, el número no figura como pendiente', () => {
    expect(pendingListEditor(complete(), CATALOGOS).variables).toEqual([])
  })

  it('informa las variables sin valor, en el orden en que aparecen', () => {
    const datos = { ...DATA_COMPLETOS, ubicacion: '', forma_pago: ' ' }
    const estado = guardada({ ...complete(), equipoId: '', datos })
    expect(pendingListEditor(estado, CATALOGOS).variables).toEqual([
      'capacidad',
      'ubicacion',
      'equipo_descripcion',
      'forma_pago',
    ])
  })

  it('un equipo inactivo que ya estaba elegido sigue resolviendo sus variables', () => {
    expect(pendingListEditor(guardada({ ...complete(), equipoId: EQUIPMENT_70 }), CATALOGOS).variables).toEqual([])
  })

  it('las variables de un bloque oculto no cuentan', () => {
    const estado = guardada({ ...complete(), datos: { ...DATA_COMPLETOS, horario: '', duracion_estimada: '' } })
    expect(pendingListEditor(estado, CATALOGOS).variables).toEqual(['horario', 'duracion_estimada'])
    const hidden = reduceEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, changes: { hidden: true } })
    expect(pendingListEditor(hidden, CATALOGOS).variables).toEqual([])
  })

  it('la próxima actualización sale del mes elegido o, si no hay, del valor de la empresa', () => {
    const monthly = guardada({
      ...complete(),
      formato: 'mensual',
      bloques: [{ clave: newKey(), titulo: '', contenido: 'Próxima: {{proxima_actualizacion}}.', hidden: false }],
    })
    expect(pendingListEditor(monthly, CATALOGOS).variables).toEqual([])
    const withoutCompany = { ...CATALOGOS, empresa: { ...CATALOGOS.empresa, proxima_actualizacion: '' } }
    expect(pendingListEditor(monthly, withoutCompany).variables).toEqual(['proxima_actualizacion'])
    expect(pendingListEditor({ ...monthly, proximaActualizacion: '2026-11' }, withoutCompany).variables).toEqual([])
  })

  it('informa las variables mal escritas', () => {
    const estado = guardada({ ...complete(), intro: 'Servicios en {{ubicación}}.' })
    const pendingList = pendingListEditor(estado, CATALOGOS)
    expect(pendingList.desconocidas).toEqual(['ubicación'])
    expect(canSend(pendingList)).toBe(false)
  })

  it('cuenta los ítems sin precio (vacíos o mal escritos) y si no hay ítems', () => {
    const estado = guardada(withItems([item({ precio: '100' }), item({ precio: '' }), item({ precio: 'abc' })]))
    expect(pendingListEditor(estado, CATALOGOS)).toMatchObject({ itemsWithoutPrice: 2, withoutItems: false })
    expect(pendingListEditor(guardada({ ...complete(), items: [] }), CATALOGOS)).toMatchObject({
      itemsWithoutPrice: 0,
      withoutItems: true,
    })
  })

  it('con fecha o validez a medio escribir no explota', () => {
    expect(() => pendingListEditor({ ...complete(), fecha: '2026-1', validezDias: 'x' }, CATALOGOS)).not.toThrow()
  })

  it('puedeEnviar exige que no falte nada', () => {
    const nada: PendingList = { variables: [], desconocidas: [], itemsWithoutPrice: 0, withoutItems: false }
    expect(canSend(nada)).toBe(true)
    expect(canSend({ ...nada, variables: ['ubicacion'] })).toBe(false)
    expect(canSend({ ...nada, desconocidas: ['ubicación'] })).toBe(false)
    expect(canSend({ ...nada, itemsWithoutPrice: 1 })).toBe(false)
    expect(canSend({ ...nada, withoutItems: true })).toBe(false)
  })
})
