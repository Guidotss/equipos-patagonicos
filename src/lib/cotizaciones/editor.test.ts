import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { hoyArgentina } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import type { Database } from '@/lib/supabase/database.types'
import { armarDocumento } from './documento'
import {
  SELECT_EDITOR,
  aplicarPlantilla,
  esquemaEstadoEditor,
  estadoDesdeFila,
  estadoNuevo,
  fuenteDesdeEditor,
  hayCambios,
  nuevaClave,
  payloadGuardar,
  pendientesEditor,
  puedeEnviar,
  reducirEditor,
  textoCantidad,
  textoPrecio,
  type CatalogosEditor,
  type EstadoEditor,
  type FilaEditor,
  type ItemEditor,
  type Pendientes,
  type PlantillaEditor,
} from './editor'
import { EJEMPLO_JORNADA } from './ejemplos'

const ID = '5a8d1c2e-1f4b-4c3a-9e7d-2b6f8a9c0d11'
const CLIENTE = {
  id: '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}
const CONTACTO = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const EQUIPO_40 = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a'
const EQUIPO_70 = '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b'
const FIRMANTE = '3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c'
const PLANTILLA_JORNADA_ID = '4a5b6c7d-8e9f-4a0b-9c2d-3e4f5a6b7c8d'
const PLANTILLA_MENSUAL_ID = '6c7d8e9f-0a1b-4c2d-8e4f-5a6b7c8d9e0f'
const ANTERIOR = '8e9f0a1b-2c3d-4e4f-9a6b-7c8d9e0f1a2b'

// Las plantillas de los datos iniciales, recortadas a lo que importa para estos tests.
const DESCRIPCIONES_JORNADA = [
  'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)',
  'Movilización y desmovilización de Grúa Telescópica',
  'Jornadas diarias (8 hs) adicionales, domingos y feriados',
]

const PLANTILLA_JORNADA: PlantillaEditor = {
  id: PLANTILLA_JORNADA_ID,
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
  intro: 'Alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para servicios de izajes en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', oculto: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.\nTiempo estimado: {{duracion_estimada}}.', oculto: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.', oculto: false },
  ],
  items: [
    { seccion: 'Precios Jornada', descripcion: DESCRIPCIONES_JORNADA[0], unidad: 'JORNADA', cantidad: 1 },
    { seccion: 'Precios Jornada', descripcion: DESCRIPCIONES_JORNADA[1], unidad: 'VIAJE', cantidad: 1 },
    { seccion: 'Precios Jornada Adicional', descripcion: DESCRIPCIONES_JORNADA[2], unidad: 'JORNADA', cantidad: 1 },
  ],
}

const PLANTILLA_MENSUAL: PlantillaEditor = {
  id: PLANTILLA_MENSUAL_ID,
  nombre: 'Mensual - Grúa con operador',
  formato: 'mensual',
  asunto: '',
  intro: '',
  validez_dias: 15,
  bloques: [
    { titulo: 'RENEGOCIACIÓN DE TARIFAS', contenido: 'Próxima actualización: {{proxima_actualizacion}}.', oculto: false },
  ],
  items: [{ seccion: '', descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', unidad: 'UNIDAD', cantidad: 1 }],
}

const CATALOGOS: CatalogosEditor = {
  plantillas: [PLANTILLA_MENSUAL, PLANTILLA_JORNADA],
  equipos: [
    {
      id: EQUIPO_40,
      nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
      capacidad_tn: 40,
      descripcion: 'Grúa XCMG QY70K-1 de 40 TN.',
      activo: true,
    },
    { id: EQUIPO_70, nombre: 'Grúa XCMG 70 TN', capacidad_tn: 70, descripcion: 'Grúa XCMG de 70 TN.', activo: false },
  ],
  firmantes: [
    { id: FIRMANTE, nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985', activo: true },
  ],
  empresa: EJEMPLO_JORNADA.empresa,
}

const DATOS_COMPLETOS = {
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
function completa(): EstadoEditor {
  const estado = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
  const precios = ['1.950.000', '2.800.000', '2530000']
  return {
    ...estado,
    cliente: CLIENTE,
    contactoId: CONTACTO,
    equipoId: EQUIPO_40,
    datos: DATOS_COMPLETOS,
    items: estado.items.map((item, indice) => ({ ...item, precio: precios[indice] })),
  }
}

/** El estado sin las claves (que son aleatorias), para comparar. */
function sinClaves(estado: EstadoEditor) {
  return {
    ...estado,
    items: estado.items.map(({ clave, ...item }) => ({ ...item, clave: typeof clave })),
    bloques: estado.bloques.map(({ clave, ...bloque }) => ({ ...bloque, clave: typeof clave })),
  }
}

function claves(items: { clave: string }[]) {
  return items.map((item) => item.clave)
}

function item(cambios: Partial<ItemEditor>): ItemEditor {
  return { clave: nuevaClave(), seccion: '', descripcion: 'Jornada', cantidad: '1', precio: '', unidad: 'JORNADA', ...cambios }
}

function conItems(items: ItemEditor[]): EstadoEditor {
  return { ...completa(), items }
}

function errores(estado: EstadoEditor) {
  const resultado = payloadGuardar(estado)
  if (resultado.ok) throw new Error('debería fallar')
  return resultado.errores
}

function payload(estado: EstadoEditor) {
  const resultado = payloadGuardar(estado)
  if (!resultado.ok) throw new Error(`no debería fallar: ${JSON.stringify(resultado.errores)}`)
  return resultado.payload
}

const FILA: FilaEditor = {
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
    { titulo: 'Notas', contenido: 'Oculto', oculto: true },
  ],
  validez_dias: 15,
  mostrar_total: true,
  fecha_proxima_actualizacion: '2026-11-01',
  contacto_id: null,
  plantilla_id: PLANTILLA_JORNADA_ID,
  equipo_id: EQUIPO_40,
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
    expectTypeOf(consulta).returns.resolves.toHaveProperty('data').exclude<null>().toExtend<FilaEditor>()
  })
})

describe('nuevaClave', () => {
  it('genera claves UUID distintas', () => {
    const [a, b] = [nuevaClave(), nuevaClave()]
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })

  it('sin crypto.randomUUID (el dev server abierto por la IP de la red, sin HTTPS) igual da claves distintas', () => {
    vi.stubGlobal('crypto', {})
    try {
      const [a, b] = [nuevaClave(), nuevaClave()]
      expect(a).not.toBe(b)
      expect(a).toMatch(/^[0-9a-z-]{1,64}$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('textoPrecio y textoCantidad', () => {
  it('escriben los números como se tipean en la grilla', () => {
    expect(textoPrecio(39_000_000)).toBe('39.000.000')
    expect(textoPrecio(1_950_000.5)).toBe('1.950.000,50')
    expect(textoPrecio(0)).toBe('0')
    expect(textoCantidad(1)).toBe('1')
    expect(textoCantidad(1.5)).toBe('1,5')
    expect(textoCantidad(0.25)).toBe('0,25')
  })

  it.each([0, 1, 950, 1_950, 260_000, 1_950_000.5, 39_000_000, 999_999_999_999.99, 0.5])(
    'parsePrecio vuelve a leer el precio %d',
    (precio) => {
      expect(parsePrecio(textoPrecio(precio))).toBe(precio)
    },
  )

  it.each([1, 1.5, 2.25, 12, 1000, 999_999])('parsePrecio vuelve a leer la cantidad %d', (cantidad) => {
    expect(parsePrecio(textoCantidad(cantidad))).toBe(cantidad)
  })
})

describe('estadoNuevo', () => {
  it('con plantilla: borrador de la app con asunto, textos, validez e ítems sin precio', () => {
    const estado = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
    expect(sinClaves(estado)).toEqual({
      id: null,
      version: null,
      numero: null,
      estado: 'borrador',
      origen: 'app',
      cliente: null,
      contactoId: '',
      plantillaId: PLANTILLA_JORNADA_ID,
      formato: 'jornada',
      equipoId: '',
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      validezDias: '30',
      mostrarTotal: false,
      proximaActualizacion: '',
      asunto: PLANTILLA_JORNADA.asunto,
      intro: PLANTILLA_JORNADA.intro,
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
      items: PLANTILLA_JORNADA.items.map((item) => ({
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: '1',
        precio: '',
        unidad: item.unidad,
        clave: 'string',
      })),
      bloques: PLANTILLA_JORNADA.bloques.map((bloque) => ({ ...bloque, clave: 'string' })),
      reemplazaA: null,
    })
    expect(new Set([...claves(estado.items), ...claves(estado.bloques)]).size).toBe(6)
  })

  it('sin plantilla: vacía, mensual y con la validez por defecto de la base', () => {
    const estado = estadoNuevo({ plantilla: null, firmanteId: '', hoy: '2026-10-25' })
    expect(estado).toMatchObject({ plantillaId: '', formato: 'mensual', validezDias: '30', items: [], bloques: [] })
  })
})

describe('estadoDesdeFila', () => {
  it('convierte la fila guardada al estado del editor', () => {
    expect(sinClaves(estadoDesdeFila(FILA))).toEqual({
      id: ID,
      version: '2026-10-20T15:04:05.123456+00:00',
      numero: 112712,
      estado: 'enviada',
      origen: 'app',
      cliente: CLIENTE,
      contactoId: '',
      plantillaId: PLANTILLA_JORNADA_ID,
      formato: 'jornada',
      equipoId: EQUIPO_40,
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
        { titulo: 'Alcance', contenido: '- Item', oculto: false, clave: 'string' },
        { titulo: 'Notas', contenido: 'Oculto', oculto: true, clave: 'string' },
      ],
      reemplazaA: ANTERIOR,
    })
  })

  it('sin fecha de próxima actualización el mes queda vacío', () => {
    expect(estadoDesdeFila({ ...FILA, fecha_proxima_actualizacion: null }).proximaActualizacion).toBe('')
  })

  it('leer dos veces la misma fila no cuenta como cambio (las claves no importan)', () => {
    expect(hayCambios(estadoDesdeFila(FILA), estadoDesdeFila(FILA))).toBe(false)
  })

  it('un valor que la base no permite es un error de programación', () => {
    expect(() => estadoDesdeFila({ ...FILA, estado: 'anulada' })).toThrow('Estado desconocido: anulada')
    expect(() => estadoDesdeFila({ ...FILA, formato: 'semanal' })).toThrow('Formato desconocido: semanal')
    expect(() => estadoDesdeFila({ ...FILA, items: [{ ...FILA.items[0], unidad: 'LITRO' }] })).toThrow(
      'Unidad desconocida: LITRO',
    )
    expect(() => estadoDesdeFila({ ...FILA, bloques: [{ titulo: 1 }] })).toThrow()
  })
})

describe('aplicarPlantilla', () => {
  it('reemplaza formato, asunto, introducción, textos, validez e ítems; conserva lo demás', () => {
    const antes = { ...completa(), proximaActualizacion: '2026-11', mostrarTotal: true }
    const despues = aplicarPlantilla(antes, PLANTILLA_MENSUAL)
    expect(despues).toMatchObject({
      plantillaId: PLANTILLA_MENSUAL_ID,
      formato: 'mensual',
      asunto: '',
      intro: '',
      validezDias: '15',
      cliente: CLIENTE,
      contactoId: CONTACTO,
      equipoId: EQUIPO_40,
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      datos: DATOS_COMPLETOS,
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
    })
    expect(despues.items.map(({ descripcion, precio, unidad }) => ({ descripcion, precio, unidad }))).toEqual([
      { descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', precio: '', unidad: 'UNIDAD' },
    ])
    expect(despues.bloques.map((bloque) => bloque.titulo)).toEqual(['RENEGOCIACIÓN DE TARIFAS'])
  })
})

describe('reducirEditor', () => {
  it('campo: cambia el campo pedido sin tocar el estado anterior', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'campo', campo: 'asunto', valor: 'Otro asunto' })
    expect(despues.asunto).toBe('Otro asunto')
    expect(antes.asunto).toBe(PLANTILLA_JORNADA.asunto)
    expect(reducirEditor(antes, { tipo: 'campo', campo: 'validezDias', valor: '45' }).validezDias).toBe('45')
    const mes = reducirEditor(antes, { tipo: 'campo', campo: 'proximaActualizacion', valor: '2026-11' })
    expect(mes.proximaActualizacion).toBe('2026-11')
    expect(reducirEditor(antes, { tipo: 'campo', campo: 'equipoId', valor: '' }).equipoId).toBe('')
  })

  it('próxima actualización: el mes escribe también el texto del PDF y vaciarlo lo borra (decisión 7)', () => {
    const conTexto = { ...completa(), datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    const mes = reducirEditor(conTexto, { tipo: 'campo', campo: 'proximaActualizacion', valor: '2026-11' })
    expect(mes).toMatchObject({ proximaActualizacion: '2026-11', datos: { proxima_actualizacion: 'noviembre de 2026' } })
    const vacio = reducirEditor(mes, { tipo: 'campo', campo: 'proximaActualizacion', valor: '' })
    expect(vacio).toMatchObject({ proximaActualizacion: '', datos: { proxima_actualizacion: '' } })
    // Sin fecha ni texto, el PDF usa el de la empresa: lo mismo antes y después de recargar.
    expect(payload(vacio).p_datos).toMatchObject({ fecha_proxima_actualizacion: null, datos: { proxima_actualizacion: '' } })
  })

  it('dato: cambia una variable de la cotización', () => {
    const despues = reducirEditor(completa(), { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' })
    expect(despues.datos).toEqual({ ...DATOS_COMPLETOS, ubicacion: 'Añelo' })
  })

  it('mostrarTotal', () => {
    expect(reducirEditor(completa(), { tipo: 'mostrarTotal', valor: true }).mostrarTotal).toBe(true)
  })

  it('cliente: cambia el cliente y el contacto juntos', () => {
    const otro = { id: ANTERIOR, razon_social: 'Milicic S.A.', cuit: null }
    expect(reducirEditor(completa(), { tipo: 'cliente', cliente: otro, contactoId: '' })).toMatchObject({
      cliente: otro,
      contactoId: '',
    })
    expect(reducirEditor(completa(), { tipo: 'cliente', cliente: null, contactoId: '' }).cliente).toBeNull()
  })

  it('plantilla: aplica la plantilla', () => {
    const despues = reducirEditor(completa(), { tipo: 'plantilla', plantilla: PLANTILLA_MENSUAL })
    expect(despues).toMatchObject({ plantillaId: PLANTILLA_MENSUAL_ID, formato: 'mensual', validezDias: '15' })
  })

  describe('agregarItem', () => {
    it('sin referencia agrega al final copiando sección y unidad de la última fila', () => {
      const antes = completa()
      const despues = reducirEditor(antes, { tipo: 'agregarItem' })
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
      const antes = completa()
      const despues = reducirEditor(antes, { tipo: 'agregarItem', despuesDe: antes.items[1].clave })
      expect(claves(despues.items).indexOf(antes.items[1].clave)).toBe(1)
      expect(despues.items[2]).toMatchObject({ seccion: 'Precios Jornada', unidad: 'VIAJE', descripcion: '' })
      expect(despues.items[3]).toEqual(antes.items[2])
    })

    it('con sección explícita la usa', () => {
      const despues = reducirEditor(completa(), { tipo: 'agregarItem', seccion: 'Otros' })
      expect(despues.items.at(-1)?.seccion).toBe('Otros')
    })

    it('con una fila que ya no existe agrega al final', () => {
      const despues = reducirEditor(completa(), { tipo: 'agregarItem', despuesDe: 'no-existe' })
      expect(despues.items).toHaveLength(4)
      expect(despues.items[3].descripcion).toBe('')
    })

    it('en una grilla vacía usa la unidad del formato', () => {
      const jornada = { ...completa(), items: [] }
      expect(reducirEditor(jornada, { tipo: 'agregarItem' }).items[0]).toMatchObject({ seccion: '', unidad: 'JORNADA' })
      const mensual = { ...jornada, formato: 'mensual' as const }
      expect(reducirEditor(mensual, { tipo: 'agregarItem' }).items[0].unidad).toBe('UNIDAD')
    })
  })

  it('item: cambia solo esa fila y conserva su clave', () => {
    const antes = completa()
    const clave = antes.items[1].clave
    const despues = reducirEditor(antes, { tipo: 'item', clave, cambios: { precio: '3.000.000', unidad: 'JORNADA' } })
    expect(despues.items[1]).toEqual({ ...antes.items[1], precio: '3.000.000', unidad: 'JORNADA' })
    expect(despues.items[0]).toBe(antes.items[0])
    const conClave = { precio: '1', clave: 'otra' } as Partial<Omit<ItemEditor, 'clave'>>
    expect(reducirEditor(antes, { tipo: 'item', clave, cambios: conClave }).items[1].clave).toBe(clave)
  })

  describe('moverItem', () => {
    it('mueve una fila de lugar', () => {
      const antes = conItems([item({ descripcion: 'a' }), item({ descripcion: 'b' }), item({ descripcion: 'c' })])
      const despues = reducirEditor(antes, { tipo: 'moverItem', desde: 2, hasta: 0 })
      expect(despues.items.map((fila) => fila.descripcion)).toEqual(['c', 'a', 'b'])
    })

    it('fuera de rango o al mismo lugar no cambia nada', () => {
      const antes = conItems([item({}), item({})])
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 5 })).toBe(antes)
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: -1, hasta: 0 })).toBe(antes)
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: 1, hasta: 1 })).toBe(antes)
    })

    it('si cae en el medio de otro grupo, se suma a ese grupo', () => {
      const antes = conItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'B', descripcion: 'b2' }),
      ])
      const despues = reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 1 })
      expect(despues.items.map((fila) => `${fila.seccion}:${fila.descripcion}`)).toEqual(['B:b1', 'B:a1', 'B:b2'])
    })

    it('en el borde entre dos grupos conserva su sección', () => {
      const antes = conItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'A', descripcion: 'a2' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'C', descripcion: 'c1' }),
      ])
      const alFinal = reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 3 })
      expect(alFinal.items.map((fila) => `${fila.seccion}:${fila.descripcion}`)).toEqual([
        'A:a2',
        'B:b1',
        'C:c1',
        'A:a1',
      ])
      const entreGrupos = reducirEditor(antes, { tipo: 'moverItem', desde: 3, hasta: 2 })
      expect(entreGrupos.items.map((fila) => fila.seccion)).toEqual(['A', 'A', 'C', 'B'])
    })
  })

  it('quitarItem', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'quitarItem', clave: antes.items[0].clave })
    expect(despues.items).toEqual(antes.items.slice(1))
  })

  it('con una clave que ya no existe, item, quitarItem y bloque devuelven el mismo estado', () => {
    const antes = completa()
    expect(reducirEditor(antes, { tipo: 'item', clave: 'no-existe', cambios: { precio: '1' } })).toBe(antes)
    expect(reducirEditor(antes, { tipo: 'quitarItem', clave: 'no-existe' })).toBe(antes)
    expect(reducirEditor(antes, { tipo: 'bloque', clave: 'no-existe', cambios: { oculto: true } })).toBe(antes)
  })

  it('duplicarItem: la copia va debajo con otra clave', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'duplicarItem', clave: antes.items[0].clave })
    expect(despues.items).toHaveLength(4)
    expect(despues.items[1]).toEqual({ ...antes.items[0], clave: expect.any(String) })
    expect(despues.items[1].clave).not.toBe(antes.items[0].clave)
    expect(reducirEditor(antes, { tipo: 'duplicarItem', clave: 'no-existe' })).toBe(antes)
  })

  it('renombrarSeccion: renombra solo el grupo consecutivo de esa fila', () => {
    const antes = conItems([
      item({ seccion: 'A' }),
      item({ seccion: 'A' }),
      item({ seccion: 'B' }),
      item({ seccion: 'A' }),
    ])
    const despues = reducirEditor(antes, { tipo: 'renombrarSeccion', clave: antes.items[1].clave, seccion: 'Precios' })
    expect(despues.items.map((fila) => fila.seccion)).toEqual(['Precios', 'Precios', 'B', 'A'])
    expect(reducirEditor(antes, { tipo: 'renombrarSeccion', clave: 'no-existe', seccion: 'X' })).toBe(antes)
  })

  it('agregarSeccion: agrega una fila vacía en una sección nueva al final', () => {
    const despues = reducirEditor(completa(), { tipo: 'agregarSeccion', nombre: '  Horas extra ' })
    expect(despues.items.at(-1)).toMatchObject({ seccion: 'Horas extra', descripcion: '', unidad: 'JORNADA' })
    const sinNombre = reducirEditor(completa(), { tipo: 'agregarSeccion', nombre: ' ' })
    expect(sinNombre.items.at(-1)?.seccion).toBe('Nueva sección')
  })

  it('bloque: cambia texto u oculto de un bloque', () => {
    const antes = completa()
    const clave = antes.bloques[1].clave
    const despues = reducirEditor(antes, { tipo: 'bloque', clave, cambios: { oculto: true } })
    expect(despues.bloques[1]).toEqual({ ...antes.bloques[1], oculto: true })
    expect(despues.bloques[0]).toBe(antes.bloques[0])
  })

  it('moverBloque: sube o baja uno; en los extremos no cambia', () => {
    const antes = completa()
    const [primero, segundo, tercero] = claves(antes.bloques)
    expect(claves(reducirEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: -1 }).bloques)).toEqual([
      segundo,
      primero,
      tercero,
    ])
    expect(claves(reducirEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: 1 }).bloques)).toEqual([
      primero,
      tercero,
      segundo,
    ])
    expect(reducirEditor(antes, { tipo: 'moverBloque', clave: primero, direccion: -1 })).toBe(antes)
    expect(reducirEditor(antes, { tipo: 'moverBloque', clave: tercero, direccion: 1 })).toBe(antes)
  })

  it('restaurarBloques: reemplaza los bloques por los dados, con claves nuevas', () => {
    const despues = reducirEditor(completa(), { tipo: 'restaurarBloques', bloques: PLANTILLA_MENSUAL.bloques })
    expect(despues.bloques).toEqual([{ ...PLANTILLA_MENSUAL.bloques[0], clave: expect.any(String) }])
  })

  it('guardado: anota id, versión y número sin tocar el contenido', () => {
    const antes = completa()
    const version = '2026-10-25T12:00:00+00:00'
    const despues = reducirEditor(antes, { tipo: 'guardado', id: ID, version, numero: 112713 })
    expect(despues).toEqual({ ...antes, id: ID, version, numero: 112713 })
  })

  it('reemplazar: devuelve el estado dado', () => {
    const otro = estadoDesdeFila(FILA)
    expect(reducirEditor(completa(), { tipo: 'reemplazar', estado: otro })).toBe(otro)
  })
})

describe('hayCambios', () => {
  it('el mismo estado no tiene cambios', () => {
    const estado = completa()
    expect(hayCambios(estado, estado)).toBe(false)
  })

  it('cambiar algo y volverlo atrás', () => {
    const guardado = completa()
    const editado = reducirEditor(guardado, { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' })
    expect(hayCambios(guardado, editado)).toBe(true)
    const revertido = reducirEditor(editado, { tipo: 'dato', campo: 'ubicacion', valor: DATOS_COMPLETOS.ubicacion })
    expect(hayCambios(guardado, revertido)).toBe(false)
  })

  it('lo que no cambia lo guardado no cuenta: formato del precio, espacios de más y el número asignado', () => {
    const guardado = completa()
    const clave = guardado.items[2].clave
    const precio = reducirEditor(guardado, { tipo: 'item', clave, cambios: { precio: '2.530.000,00' } })
    expect(hayCambios(guardado, precio)).toBe(false)
    expect(hayCambios(guardado, { ...guardado, asunto: `${guardado.asunto}  ` })).toBe(false)
    const conNumero = reducirEditor(guardado, { tipo: 'guardado', id: ID, version: 'v2', numero: 112713 })
    expect(hayCambios(guardado, conNumero)).toBe(false)
  })

  it('reordenar ítems u ocultar un bloque sí es un cambio', () => {
    const guardado = completa()
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'moverItem', desde: 0, hasta: 1 }))).toBe(true)
    const clave = guardado.bloques[0].clave
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'bloque', clave, cambios: { oculto: true } }))).toBe(true)
  })

  it('con algo a medio escribir compara el contenido', () => {
    const guardado = completa()
    const clave = guardado.items[0].clave
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'item', clave, cambios: { precio: 'abc' } }))).toBe(true)
    const nueva = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
    expect(hayCambios(nueva, nueva)).toBe(false)
    expect(hayCambios(nueva, reducirEditor(nueva, { tipo: 'campo', campo: 'asunto', valor: 'x' }))).toBe(true)
  })
})

describe('payloadGuardar', () => {
  it('arma la cabecera completa y los ítems que espera guardar_cotizacion', () => {
    const estado: EstadoEditor = {
      ...completa(),
      asunto: '  Cotización N° {{numero}}  ',
      validezDias: ' 45 ',
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
      reemplazaA: ANTERIOR,
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
        plantilla_id: PLANTILLA_JORNADA_ID,
        equipo_id: EQUIPO_40,
        firmante_id: FIRMANTE,
        fecha: '2026-10-25',
        asunto: 'Cotización N° {{numero}}',
        intro: PLANTILLA_JORNADA.intro,
        datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'noviembre de 2026' },
        bloques: PLANTILLA_JORNADA.bloques,
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
    const datos = payload({ ...completa(), contactoId: '', equipoId: '', firmanteId: '', plantillaId: '' }).p_datos
    expect(datos).toMatchObject({ contacto_id: null, equipo_id: null, firmante_id: null, plantilla_id: null })
  })

  it('sin mes de actualización: la fecha va en null y se conserva el texto que hubiera', () => {
    const estado = { ...completa(), datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    expect(payload(estado).p_datos).toMatchObject({
      fecha_proxima_actualizacion: null,
      datos: { proxima_actualizacion: 'marzo de 2027' },
    })
  })

  it('los bloques ocultos viajan con oculto: true y sin las claves', () => {
    const estado = completa()
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(payload(oculto).p_datos.bloques).toEqual([
      PLANTILLA_JORNADA.bloques[0],
      { ...PLANTILLA_JORNADA.bloques[1], oculto: true },
      PLANTILLA_JORNADA.bloques[2],
    ])
  })

  it('el contenido de un bloque no se recorta (dos espacios al principio son una subviñeta)', () => {
    const estado = completa()
    const conSangria = reducirEditor(estado, {
      tipo: 'bloque',
      clave: estado.bloques[0].clave,
      cambios: { titulo: '  Equipo  ', contenido: '  - Grúa\n' },
    })
    expect((payload(conSangria).p_datos.bloques as { titulo: string; contenido: string }[])[0]).toMatchObject({
      titulo: 'Equipo',
      contenido: '  - Grúa\n',
    })
  })

  it('una cotización sin ítems se puede guardar (borrador)', () => {
    expect(payload({ ...completa(), items: [] }).p_items).toEqual([])
  })

  it('exige el cliente', () => {
    expect(errores({ ...completa(), cliente: null })).toEqual({ cliente: 'Elegí el cliente' })
    expect(errores({ ...completa(), cliente: { ...CLIENTE, id: 'x' } })).toEqual({ cliente: 'Elegí el cliente' })
  })

  it.each(['', '0', '366', 'abc', '30.5', '-3'])('rechaza la validez %j', (validezDias) => {
    expect(errores({ ...completa(), validezDias })).toEqual({ validezDias: 'Ingresá una validez de 1 a 365 días' })
  })

  it('valida fecha, mes, formato e identificadores', () => {
    expect(errores({ ...completa(), fecha: '2026-02-30' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errores({ ...completa(), fecha: '' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errores({ ...completa(), proximaActualizacion: '2026-13' })).toEqual({
      proximaActualizacion: 'Elegí un mes válido',
    })
    expect(errores({ ...completa(), formato: 'semanal' as never })).toEqual({ formato: 'Elegí el formato' })
    expect(errores({ ...completa(), equipoId: 'x', contactoId: 'y', reemplazaA: 'z' })).toEqual({
      equipoId: 'Equipo inválido',
      contactoId: 'Contacto inválido',
      reemplazaA: 'Cotización anterior inválida',
    })
  })

  it('marca cada celda con error con su fila', () => {
    const estado = conItems([
      item({ descripcion: 'Bien', precio: '100' }),
      item({ descripcion: '  ', cantidad: '', precio: 'abc' }),
      item({ cantidad: '0', precio: '-5' }),
      item({ cantidad: 'dos', precio: '1.000.000.000.000' }),
      item({ unidad: 'LITRO' as never }),
    ])
    expect(errores(estado)).toEqual({
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
    const estado = conItems([item({ cantidad: '999.999', precio: '999.999.999' })])
    expect(errores(estado)).toEqual({ 'items.0.precio': 'El total de la fila es demasiado grande' })
  })

  it('valida el largo de los datos y los textos', () => {
    const largo = 'x'.repeat(501)
    expect(errores({ ...completa(), asunto: largo, datos: { ...DATOS_COMPLETOS, ubicacion: largo } })).toEqual({
      asunto: 'Máximo 500 caracteres',
      'datos.ubicacion': 'Máximo 500 caracteres',
    })
  })

  it('junta todos los errores a la vez', () => {
    const estado = { ...completa(), cliente: null, validezDias: '', items: [item({ descripcion: '' })] }
    expect(Object.keys(errores(estado))).toEqual(['cliente', 'validezDias', 'items.0.descripcion'])
  })

  it('no explota con datos mal formados (la Server Action recibe lo que mande el navegador)', () => {
    const roto = { ...completa(), items: 'nada', bloques: null, datos: 3 } as unknown as EstadoEditor
    expect(Object.keys(errores(roto))).toEqual(['datos', 'items', 'bloques'])
    expect(errores(null as unknown as EstadoEditor)).toHaveProperty('')
  })
})

describe('esquemaEstadoEditor', () => {
  it('acepta cualquier estado que arma el editor, aunque no se pueda guardar', () => {
    const nueva = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: '', hoy: '2026-10-25' })
    expect(esquemaEstadoEditor.parse(nueva)).toEqual(nueva)
    const leida = estadoDesdeFila(FILA)
    expect(esquemaEstadoEditor.parse(leida)).toEqual(leida)
    const aMedias = { ...completa(), fecha: '', validezDias: 'x', items: [item({ precio: 'abc', cantidad: '' })] }
    expect(esquemaEstadoEditor.safeParse(aMedias).success).toBe(true)
  })

  it('rechaza lo que no es un estado del editor', () => {
    const estado = completa()
    for (const roto of [
      null,
      { ...estado, items: 'nada' },
      { ...estado, cliente: { ...CLIENTE, id: 'x' } },
      { ...estado, equipoId: 'x' },
      { ...estado, estado: 'anulada' },
      { ...estado, items: [{ ...estado.items[0], unidad: 'LITRO' }] },
      { ...estado, intro: 'x'.repeat(20_001) },
      { ...estado, items: Array.from({ length: 501 }, () => item({})) },
    ]) {
      expect(esquemaEstadoEditor.safeParse(roto).success).toBe(false)
    }
  })
})

describe('fuenteDesdeEditor', () => {
  it('arma el documento con los catálogos, el contacto y el estado sin guardar', () => {
    const estado = { ...completa(), numero: 112713, proximaActualizacion: '2026-12' }
    const fuente = fuenteDesdeEditor(estado, CATALOGOS, { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' })
    expect(fuente).toEqual({
      cotizacion: {
        numero: 112713,
        fecha: '2026-10-25',
        formato: 'jornada',
        asunto: PLANTILLA_JORNADA.asunto,
        intro: PLANTILLA_JORNADA.intro,
        validez_dias: 30,
        mostrar_total: false,
        datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'diciembre de 2026' },
        bloques: PLANTILLA_JORNADA.bloques,
      },
      items: PLANTILLA_JORNADA.items.map((item, indice) => ({
        orden: indice + 1,
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: 1,
        precio_unitario: [1_950_000, 2_800_000, 2_530_000][indice],
        unidad: item.unidad,
      })),
      cliente: { razon_social: CLIENTE.razon_social, cuit: CLIENTE.cuit },
      contacto: { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' },
      equipo: { capacidad_tn: 40, descripcion: 'Grúa XCMG QY70K-1 de 40 TN.' },
      firmante: { nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985' },
      empresa: EJEMPLO_JORNADA.empresa,
    })
    const doc = armarDocumento(fuente)
    expect(doc.asunto).toBe('Cotización N° 112713 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario).toMatchObject({ cuit: '30-71952967-0', atencion: 'Yanina Colman' })
  })

  it('lo que está a medio escribir no rompe el documento', () => {
    const estado = {
      ...completa(),
      cliente: null,
      fecha: '',
      validezDias: '',
      equipoId: 'no-existe',
      items: [item({ cantidad: 'x', precio: 'y' })],
    }
    const fuente = fuenteDesdeEditor(estado, CATALOGOS, null)
    expect(fuente.cotizacion).toMatchObject({ fecha: hoyArgentina(), validez_dias: 0, numero: null })
    expect(fuente.items[0]).toMatchObject({ cantidad: 1, precio_unitario: null })
    expect(fuente).toMatchObject({ cliente: { razon_social: '', cuit: null }, equipo: null })
    expect(() => armarDocumento(fuente)).not.toThrow()
  })
})

describe('pendientesEditor y puedeEnviar', () => {
  const guardada = (estado: EstadoEditor): EstadoEditor => ({ ...estado, id: ID, numero: 112713 })

  it('una cotización completa no tiene pendientes y se puede enviar', () => {
    const pendientes = pendientesEditor(guardada(completa()), CATALOGOS)
    expect(pendientes).toEqual({ variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false })
    expect(puedeEnviar(pendientes)).toBe(true)
  })

  it('sin guardar, el número no figura como pendiente', () => {
    expect(pendientesEditor(completa(), CATALOGOS).variables).toEqual([])
  })

  it('informa las variables sin valor, en el orden en que aparecen', () => {
    const datos = { ...DATOS_COMPLETOS, ubicacion: '', forma_pago: ' ' }
    const estado = guardada({ ...completa(), equipoId: '', datos })
    expect(pendientesEditor(estado, CATALOGOS).variables).toEqual([
      'capacidad',
      'ubicacion',
      'equipo_descripcion',
      'forma_pago',
    ])
  })

  it('un equipo inactivo que ya estaba elegido sigue resolviendo sus variables', () => {
    expect(pendientesEditor(guardada({ ...completa(), equipoId: EQUIPO_70 }), CATALOGOS).variables).toEqual([])
  })

  it('las variables de un bloque oculto no cuentan', () => {
    const estado = guardada({ ...completa(), datos: { ...DATOS_COMPLETOS, horario: '', duracion_estimada: '' } })
    expect(pendientesEditor(estado, CATALOGOS).variables).toEqual(['horario', 'duracion_estimada'])
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(pendientesEditor(oculto, CATALOGOS).variables).toEqual([])
  })

  it('la próxima actualización sale del mes elegido o, si no hay, del valor de la empresa', () => {
    const mensual = guardada({
      ...completa(),
      formato: 'mensual',
      bloques: [{ clave: nuevaClave(), titulo: '', contenido: 'Próxima: {{proxima_actualizacion}}.', oculto: false }],
    })
    expect(pendientesEditor(mensual, CATALOGOS).variables).toEqual([])
    const sinEmpresa = { ...CATALOGOS, empresa: { ...CATALOGOS.empresa, proxima_actualizacion: '' } }
    expect(pendientesEditor(mensual, sinEmpresa).variables).toEqual(['proxima_actualizacion'])
    expect(pendientesEditor({ ...mensual, proximaActualizacion: '2026-11' }, sinEmpresa).variables).toEqual([])
  })

  it('informa las variables mal escritas', () => {
    const estado = guardada({ ...completa(), intro: 'Servicios en {{ubicación}}.' })
    const pendientes = pendientesEditor(estado, CATALOGOS)
    expect(pendientes.desconocidas).toEqual(['ubicación'])
    expect(puedeEnviar(pendientes)).toBe(false)
  })

  it('cuenta los ítems sin precio (vacíos o mal escritos) y si no hay ítems', () => {
    const estado = guardada(conItems([item({ precio: '100' }), item({ precio: '' }), item({ precio: 'abc' })]))
    expect(pendientesEditor(estado, CATALOGOS)).toMatchObject({ itemsSinPrecio: 2, sinItems: false })
    expect(pendientesEditor(guardada({ ...completa(), items: [] }), CATALOGOS)).toMatchObject({
      itemsSinPrecio: 0,
      sinItems: true,
    })
  })

  it('con fecha o validez a medio escribir no explota', () => {
    expect(() => pendientesEditor({ ...completa(), fecha: '2026-1', validezDias: 'x' }, CATALOGOS)).not.toThrow()
  })

  it('puedeEnviar exige que no falte nada', () => {
    const nada: Pendientes = { variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false }
    expect(puedeEnviar(nada)).toBe(true)
    expect(puedeEnviar({ ...nada, variables: ['ubicacion'] })).toBe(false)
    expect(puedeEnviar({ ...nada, desconocidas: ['ubicación'] })).toBe(false)
    expect(puedeEnviar({ ...nada, itemsSinPrecio: 1 })).toBe(false)
    expect(puedeEnviar({ ...nada, sinItems: true })).toBe(false)
  })
})
