// src/lib/cotizaciones/acciones-estado.test.ts
import { describe, expect, it } from 'vitest'
import {
  accionDesdeParametro,
  apruebaVersionNoEnviada,
  disposicionAcciones,
  editadaDespuesDelEnvio,
  errorFechaAprobacion,
  esConflicto,
  esEditable,
  estadoAlRevertir,
  fechaHoraDeMarca,
  franjasEstado,
  idPrecioItem,
  motivoBloqueo,
  pendientesVisibles,
  transicionesDeLista,
} from './acciones-estado'
import { CONTEXTO_NUEVA } from './contexto-estado'
import type { ItemEditor, Pendientes } from './editor'

const ID = '0b6f3c1e-5a2d-4f7e-9c8b-1d2e3f4a5b6c'
const ENVIO = { id: '5c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', enviada_at: '2026-10-20T17:35:00.123456+00:00' }
const SIN_PENDIENTES: Pendientes = { variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false }

function item(clave: string, precio: string): ItemEditor {
  return { clave, seccion: '', descripcion: 'Jornada', cantidad: '1', precio, unidad: 'JORNADA' }
}

describe('disposicionAcciones', () => {
  const app = { id: ID, origen: 'app' } as const

  it('borrador: enviar es la principal; eliminar solo si nunca se envió', () => {
    expect(disposicionAcciones({ ...app, estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: ['duplicar', 'rechazar', 'borrar'],
    })
    expect(disposicionAcciones({ ...app, estado: 'borrador' }, { envios: [ENVIO] }).menu).toEqual(['duplicar', 'rechazar'])
  })

  it('enviada: aprobar es la principal y reenviar va al menú', () => {
    expect(disposicionAcciones({ ...app, estado: 'enviada' }, { envios: [ENVIO] })).toEqual({
      botones: [
        { accion: 'rechazar', primaria: false },
        { accion: 'aprobar', primaria: true },
      ],
      menu: ['reenviar', 'duplicar'],
    })
  })

  it('aprobada: descargar y duplicar; revertir en el menú', () => {
    expect(disposicionAcciones({ ...app, estado: 'aprobada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'descargar', primaria: false },
        { accion: 'duplicar', primaria: true },
      ],
      menu: ['revertir'],
    })
  })

  it('rechazada: reabrir es la principal', () => {
    expect(disposicionAcciones({ ...app, estado: 'rechazada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'reabrir', primaria: true },
        { accion: 'duplicar', primaria: false },
      ],
      menu: [],
    })
  })

  it('una nueva muestra enviar y aprobar (guardan primero, decisión 12) y las cargadas no usan el editor', () => {
    expect(disposicionAcciones({ id: null, origen: 'app', estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: [],
    })
    expect(disposicionAcciones({ ...app, origen: 'importada', estado: 'enviada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [],
      menu: [],
    })
  })
})

describe('motivoBloqueo', () => {
  it('enviar y aprobar esperan a que no falte nada (una nueva se guarda al enviar o aprobar)', () => {
    expect(motivoBloqueo('enviar', SIN_PENDIENTES)).toBeNull()
    expect(motivoBloqueo('aprobar', { ...SIN_PENDIENTES, itemsSinPrecio: 1 })).toBe(
      'Completá lo que falta para enviarla o aprobarla',
    )
    expect(motivoBloqueo('reenviar', SIN_PENDIENTES)).toBeNull()
  })

  it('el resto no depende de lo que falta', () => {
    expect(motivoBloqueo('rechazar', { ...SIN_PENDIENTES, sinItems: true })).toBeNull()
    expect(motivoBloqueo('duplicar', { ...SIN_PENDIENTES, variables: ['ubicacion'] })).toBeNull()
  })
})

describe('transicionesDeLista', () => {
  it('las del ⋯ de una fila según el estado (relev-visual §1.6), solo en las de la app', () => {
    const app = (estado: string) => transicionesDeLista({ estado, origen: null }).map(({ accion }) => accion)
    expect(app('borrador')).toEqual(['borrar'])
    expect(app('enviada')).toEqual(['aprobar', 'rechazar'])
    expect(app('rechazada')).toEqual(['reabrir'])
    expect(app('aprobada')).toEqual([])
    expect(transicionesDeLista({ estado: 'enviada', origen: 'Cargada' })).toEqual([])
    expect(transicionesDeLista({ estado: 'enviada', origen: null })).toEqual([
      { accion: 'aprobar', etiqueta: 'Aprobar…' },
      { accion: 'rechazar', etiqueta: 'Rechazar…' },
    ])
    expect(transicionesDeLista({ estado: 'borrador', origen: null })).toEqual([
      { accion: 'borrar', etiqueta: 'Eliminar borrador…' },
    ])
  })
})

describe('estado y versiones', () => {
  it('solo se editan borradores y enviadas de la app', () => {
    expect(esEditable({ origen: 'app', estado: 'borrador' })).toBe(true)
    expect(esEditable({ origen: 'app', estado: 'enviada' })).toBe(true)
    expect(esEditable({ origen: 'app', estado: 'aprobada' })).toBe(false)
    expect(esEditable({ origen: 'app', estado: 'rechazada' })).toBe(false)
    expect(esEditable({ origen: 'importada', estado: 'enviada' })).toBe(false)
  })

  it('reconoce el conflicto de versión por su mensaje', () => {
    expect(esConflicto('La cotización cambió desde que la abriste; volvé a intentarlo')).toBe(true)
    expect(esConflicto('Hay ítems sin precio')).toBe(false)
    expect(esConflicto(null)).toBe(false)
  })

  it('editada después del envío compara instantes, con microsegundos', () => {
    expect(editadaDespuesDelEnvio(ENVIO.enviada_at, ENVIO.enviada_at)).toBe(false)
    expect(editadaDespuesDelEnvio('2026-10-20T17:35:00.123+00:00', ENVIO.enviada_at)).toBe(false)
    expect(editadaDespuesDelEnvio('2026-10-21T09:00:00+00:00', ENVIO.enviada_at)).toBe(true)
    expect(editadaDespuesDelEnvio('2026-10-21T09:00:00+00:00', null)).toBe(false)
  })

  // Limitación aceptada: revertir la aprobación de una enviada cambia updated_at sin tocar el contenido, así que al
  // volver a aprobarla también avisa. Es solo un aviso (no bloquea) y no hay en la base una marca del último guardado.
  it('avisa al aprobar una enviada con cambios que el cliente no recibió', () => {
    const enviada = { estado: 'enviada', version: ENVIO.enviada_at } as const
    expect(apruebaVersionNoEnviada(enviada, { envios: [ENVIO] }, false)).toBe(false)
    expect(apruebaVersionNoEnviada(enviada, { envios: [ENVIO] }, true)).toBe(true)
    expect(apruebaVersionNoEnviada({ ...enviada, version: '2026-10-22T12:00:00+00:00' }, { envios: [ENVIO] }, false)).toBe(
      true,
    )
    expect(apruebaVersionNoEnviada({ estado: 'borrador', version: ENVIO.enviada_at }, CONTEXTO_NUEVA, true)).toBe(false)
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', () => {
    expect(errorFechaAprobacion('2026-10-25', '2026-10-22')).toBeNull()
    expect(errorFechaAprobacion('2026-10-22', '2026-10-22')).toBeNull()
    expect(errorFechaAprobacion('2026-10-21', '2026-10-22')).toBe(
      'No puede ser anterior a la fecha de la cotización (22/10/2026)',
    )
    expect(errorFechaAprobacion('', '2026-10-22')).toBe('Ingresá la fecha de aprobación')
  })

  it('al revertir vuelve a enviada si alguna vez se envió', () => {
    expect(estadoAlRevertir({ envios: [ENVIO] })).toBe('enviada')
    expect(estadoAlRevertir(CONTEXTO_NUEVA)).toBe('borrador')
  })

  it('el parámetro ?accion= solo acepta las que piden confirmación', () => {
    expect(accionDesdeParametro('aprobar')).toBe('aprobar')
    expect(accionDesdeParametro('borrar')).toBe('borrar')
    expect(accionDesdeParametro('enviar')).toBeNull()
    expect(accionDesdeParametro(['aprobar'])).toBeNull()
    expect(accionDesdeParametro(undefined)).toBeNull()
  })

  it('cada envío del historial lleva fecha y hora argentinas', () => {
    expect(fechaHoraDeMarca(ENVIO.enviada_at)).toBe('20/10/2026 14:35')
  })
})

describe('franjasEstado', () => {
  it('enviada: la fecha del último envío y el aviso de que lo editado no le llega al cliente', () => {
    expect(franjasEstado({ estado: 'enviada' }, { ...CONTEXTO_NUEVA, envios: [ENVIO] })).toEqual([
      {
        tipo: 'enviada',
        texto: 'Enviada el 20/10/2026. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.',
        envioId: ENVIO.id,
      },
    ])
  })

  it('vencida reemplaza a la de enviada', () => {
    expect(
      franjasEstado({ estado: 'enviada' }, { ...CONTEXTO_NUEVA, envios: [ENVIO], vencida: true, venceEl: '2026-10-20' }),
    ).toEqual([
      { tipo: 'vencida', texto: 'Venció el 20/10/2026. Duplicala para renegociar o aprobala si el cliente la aceptó.' },
    ])
  })

  it('aprobada, rechazada y duplicada', () => {
    const anterior = { id: ID, numero: 112706 }
    expect(franjasEstado({ estado: 'aprobada' }, { ...CONTEXTO_NUEVA, fechaAprobacion: '2026-10-25', anterior })).toEqual([
      { tipo: 'aprobada', texto: 'Aprobada el 25/10/2026: es un presupuesto y no se modifica.' },
      { tipo: 'duplicada', anterior },
    ])
    expect(franjasEstado({ estado: 'rechazada' }, CONTEXTO_NUEVA)).toEqual([
      { tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' },
    ])
    expect(franjasEstado({ estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual([])
  })
})

describe('pendientesVisibles', () => {
  it.each([
    { variables: ['equipo_descripcion'] as const, textos: ['Descripción del equipo'] },
    { variables: ['capacidad'] as const, textos: ['Capacidad del equipo'] },
    { variables: ['capacidad', 'equipo_descripcion'] as const, textos: ['Capacidad del equipo', 'Descripción del equipo'] },
  ])('nombra los datos incompletos de un equipo ya seleccionado: $variables', ({ variables, textos }) => {
    const { faltan } = pendientesVisibles(
      { ...SIN_PENDIENTES, variables: [...variables] },
      { items: [], equipoId: ID },
    )
    expect(faltan.map(({ texto }) => texto)).toEqual(textos)
    expect(faltan.every(({ destino }) => destino === 'cotizacion-equipo')).toBe(true)
  })

  it('lista cada campo una vez, con su etiqueta y el id al que va el foco', () => {
    const { faltan } = pendientesVisibles(
      { ...SIN_PENDIENTES, variables: ['capacidad', 'equipo_descripcion', 'ubicacion', 'validez_dias'] },
      { items: [], equipoId: '' },
    )
    expect(faltan).toEqual([
      { clave: 'variable-capacidad', texto: 'Equipo', destino: 'cotizacion-equipo' },
      { clave: 'variable-ubicacion', texto: 'Lugar del servicio', destino: 'cotizacion-dato-ubicacion' },
      { clave: 'variable-validez_dias', texto: 'Validez (días)', destino: 'cotizacion-validez' },
    ])
  })

  it('el número no tiene campo: se nombra sin llevar el foco', () => {
    expect(pendientesVisibles({ ...SIN_PENDIENTES, variables: ['numero'] }, { items: [], equipoId: '' }).faltan).toEqual([
      { clave: 'variable-numero', texto: 'Número de cotización', destino: null },
    ])
  })

  it('los ítems sin precio llevan al primer precio vacío o ilegible', () => {
    const { faltan } = pendientesVisibles(
      { ...SIN_PENDIENTES, itemsSinPrecio: 2 },
      { items: [item('a', '1.950.000'), item('b', ''), item('c', ' ')], equipoId: '' },
    )
    expect(faltan).toEqual([{ clave: 'items-sin-precio', texto: '2 ítems sin precio', destino: idPrecioItem('b') }])
    expect(
      pendientesVisibles({ ...SIN_PENDIENTES, itemsSinPrecio: 1 }, { items: [item('a', '1.950.000'), item('b', '19,5,0')], equipoId: '' })
        .faltan[0].destino,
    ).toBe(idPrecioItem('b'))
    expect(pendientesVisibles({ ...SIN_PENDIENTES, itemsSinPrecio: 1 }, { items: [item('b', '')], equipoId: '' }).faltan[0].texto).toBe(
      '1 ítem sin precio',
    )
  })

  it('sin ítems y variables mal escritas', () => {
    expect(pendientesVisibles({ ...SIN_PENDIENTES, sinItems: true, desconocidas: ['ubicación'] }, { items: [], equipoId: '' })).toEqual({
      faltan: [{ clave: 'sin-items', texto: 'al menos un ítem', destino: null }],
      malEscritas: ['{{ubicación}}'],
    })
  })
})
