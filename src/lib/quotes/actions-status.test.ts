// src/lib/cotizaciones/acciones-estado.test.ts
import { describe, expect, it } from 'vitest'
import {
  actionFromParam,
  approvesVersionNoSent,
  layoutActions,
  editedDespuesOfSend,
  errorDateApproval,
  isConflict,
  isEditable,
  statusOnRevert,
  dateTimeOfMark,
  bandsStatus,
  idPriceItem,
  reasonBlock,
  pendingListVisible,
  transicionesOfList,
} from './actions-status'
import { CONTEXTO_NEW } from './context-status'
import type { ItemEditor, PendingList } from './editor'

const ID = '0b6f3c1e-5a2d-4f7e-9c8b-1d2e3f4a5b6c'
const ENVIO = { id: '5c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', enviada_at: '2026-10-20T17:35:00.123456+00:00' }
const WITHOUT_PENDING_LIST: PendingList = { variables: [], desconocidas: [], itemsWithoutPrice: 0, withoutItems: false }

function item(clave: string, price: string): ItemEditor {
  return { clave, seccion: '', descripcion: 'Jornada', cantidad: '1', precio: price, unidad: 'JORNADA' }
}

describe('disposicionAcciones', () => {
  const app = { id: ID, origen: 'app' } as const

  it('borrador: enviar es la principal; eliminar solo si nunca se envió', () => {
    expect(layoutActions({ ...app, estado: 'borrador' }, CONTEXTO_NEW)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: ['duplicar', 'rechazar', 'borrar'],
    })
    expect(layoutActions({ ...app, estado: 'borrador' }, { envios: [ENVIO] }).menu).toEqual(['duplicar', 'rechazar'])
  })

  it('enviada: aprobar es la principal y reenviar va al menú', () => {
    expect(layoutActions({ ...app, estado: 'enviada' }, { envios: [ENVIO] })).toEqual({
      botones: [
        { accion: 'rechazar', primaria: false },
        { accion: 'aprobar', primaria: true },
      ],
      menu: ['reenviar', 'duplicar'],
    })
  })

  it('aprobada: descargar y duplicar; revertir en el menú', () => {
    expect(layoutActions({ ...app, estado: 'aprobada' }, CONTEXTO_NEW)).toEqual({
      botones: [
        { accion: 'descargar', primaria: false },
        { accion: 'duplicar', primaria: true },
      ],
      menu: ['revertir'],
    })
  })

  it('rechazada: reabrir es la principal', () => {
    expect(layoutActions({ ...app, estado: 'rechazada' }, CONTEXTO_NEW)).toEqual({
      botones: [
        { accion: 'reabrir', primaria: true },
        { accion: 'duplicar', primaria: false },
      ],
      menu: [],
    })
  })

  it('una nueva muestra enviar y aprobar (guardan primero, decisión 12) y las cargadas no usan el editor', () => {
    expect(layoutActions({ id: null, origen: 'app', estado: 'borrador' }, CONTEXTO_NEW)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: [],
    })
    expect(layoutActions({ ...app, origen: 'importada', estado: 'enviada' }, CONTEXTO_NEW)).toEqual({
      botones: [],
      menu: [],
    })
  })
})

describe('motivoBloqueo', () => {
  it('enviar y aprobar esperan a que no falte nada (una nueva se guarda al enviar o aprobar)', () => {
    expect(reasonBlock('enviar', WITHOUT_PENDING_LIST)).toBeNull()
    expect(reasonBlock('aprobar', { ...WITHOUT_PENDING_LIST, itemsWithoutPrice: 1 })).toBe(
      'Completá lo que falta para enviarla o aprobarla',
    )
    expect(reasonBlock('reenviar', WITHOUT_PENDING_LIST)).toBeNull()
  })

  it('el resto no depende de lo que falta', () => {
    expect(reasonBlock('rechazar', { ...WITHOUT_PENDING_LIST, withoutItems: true })).toBeNull()
    expect(reasonBlock('duplicar', { ...WITHOUT_PENDING_LIST, variables: ['ubicacion'] })).toBeNull()
  })
})

describe('transicionesDeLista', () => {
  it('las del ⋯ de una fila según el estado (relev-visual §1.6), solo en las de la app', () => {
    const app = (estado: string) => transicionesOfList({ estado, origen: null }).map(({ accion }) => accion)
    expect(app('borrador')).toEqual(['borrar'])
    expect(app('enviada')).toEqual(['aprobar', 'rechazar'])
    expect(app('rechazada')).toEqual(['reabrir'])
    expect(app('aprobada')).toEqual([])
    expect(transicionesOfList({ estado: 'enviada', origen: 'Cargada' })).toEqual([])
    expect(transicionesOfList({ estado: 'enviada', origen: null })).toEqual([
      { accion: 'aprobar', label: 'Aprobar…' },
      { accion: 'rechazar', label: 'Rechazar…' },
    ])
    expect(transicionesOfList({ estado: 'borrador', origen: null })).toEqual([
      { accion: 'borrar', label: 'Eliminar borrador…' },
    ])
  })
})

describe('estado y versiones', () => {
  it('solo se editan borradores y enviadas de la app', () => {
    expect(isEditable({ origen: 'app', estado: 'borrador' })).toBe(true)
    expect(isEditable({ origen: 'app', estado: 'enviada' })).toBe(true)
    expect(isEditable({ origen: 'app', estado: 'aprobada' })).toBe(false)
    expect(isEditable({ origen: 'app', estado: 'rechazada' })).toBe(false)
    expect(isEditable({ origen: 'importada', estado: 'enviada' })).toBe(false)
  })

  it('reconoce el conflicto de versión por su mensaje', () => {
    expect(isConflict('La cotización cambió desde que la abriste; volvé a intentarlo')).toBe(true)
    expect(isConflict('Hay ítems sin precio')).toBe(false)
    expect(isConflict(null)).toBe(false)
  })

  it('editada después del envío compara instantes, con microsegundos', () => {
    expect(editedDespuesOfSend(ENVIO.enviada_at, ENVIO.enviada_at)).toBe(false)
    expect(editedDespuesOfSend('2026-10-20T17:35:00.123+00:00', ENVIO.enviada_at)).toBe(false)
    expect(editedDespuesOfSend('2026-10-21T09:00:00+00:00', ENVIO.enviada_at)).toBe(true)
    expect(editedDespuesOfSend('2026-10-21T09:00:00+00:00', null)).toBe(false)
  })

  // Limitación aceptada: revertir la aprobación de una enviada cambia updated_at sin tocar el contenido, así que al
  // volver a aprobarla también avisa. Es solo un aviso (no bloquea) y no hay en la base una marca del último guardado.
  it('avisa al aprobar una enviada con cambios que el cliente no recibió', () => {
    const sent = { estado: 'enviada', version: ENVIO.enviada_at } as const
    expect(approvesVersionNoSent(sent, { envios: [ENVIO] }, false)).toBe(false)
    expect(approvesVersionNoSent(sent, { envios: [ENVIO] }, true)).toBe(true)
    expect(approvesVersionNoSent({ ...sent, version: '2026-10-22T12:00:00+00:00' }, { envios: [ENVIO] }, false)).toBe(
      true,
    )
    expect(approvesVersionNoSent({ estado: 'borrador', version: ENVIO.enviada_at }, CONTEXTO_NEW, true)).toBe(false)
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', () => {
    expect(errorDateApproval('2026-10-25', '2026-10-22')).toBeNull()
    expect(errorDateApproval('2026-10-22', '2026-10-22')).toBeNull()
    expect(errorDateApproval('2026-10-21', '2026-10-22')).toBe(
      'No puede ser anterior a la fecha de la cotización (22/10/2026)',
    )
    expect(errorDateApproval('', '2026-10-22')).toBe('Ingresá la fecha de aprobación')
  })

  it('al revertir vuelve a enviada si alguna vez se envió', () => {
    expect(statusOnRevert({ envios: [ENVIO] })).toBe('enviada')
    expect(statusOnRevert(CONTEXTO_NEW)).toBe('borrador')
  })

  it('el parámetro ?accion= solo acepta las que piden confirmación', () => {
    expect(actionFromParam('aprobar')).toBe('aprobar')
    expect(actionFromParam('borrar')).toBe('borrar')
    expect(actionFromParam('enviar')).toBeNull()
    expect(actionFromParam(['aprobar'])).toBeNull()
    expect(actionFromParam(undefined)).toBeNull()
  })

  it('cada envío del historial lleva fecha y hora argentinas', () => {
    expect(dateTimeOfMark(ENVIO.enviada_at)).toBe('20/10/2026 14:35')
  })
})

describe('franjasEstado', () => {
  it('enviada: la fecha del último envío y el aviso de que lo editado no le llega al cliente', () => {
    expect(bandsStatus({ estado: 'enviada' }, { ...CONTEXTO_NEW, envios: [ENVIO] })).toEqual([
      {
        tipo: 'enviada',
        texto: 'Enviada el 20/10/2026. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.',
        envioId: ENVIO.id,
      },
    ])
  })

  it('vencida reemplaza a la de enviada', () => {
    expect(
      bandsStatus({ estado: 'enviada' }, { ...CONTEXTO_NEW, envios: [ENVIO], vencida: true, venceEl: '2026-10-20' }),
    ).toEqual([
      { tipo: 'vencida', texto: 'Venció el 20/10/2026. Duplicala para renegociar o aprobala si el cliente la aceptó.' },
    ])
  })

  it('aprobada, rechazada y duplicada', () => {
    const previous = { id: ID, numero: 112706 }
    expect(bandsStatus({ estado: 'aprobada' }, { ...CONTEXTO_NEW, dateApproval: '2026-10-25', anterior: previous })).toEqual([
      { tipo: 'aprobada', texto: 'Aprobada el 25/10/2026: es un presupuesto y no se modifica.' },
      { tipo: 'duplicada', anterior: previous },
    ])
    expect(bandsStatus({ estado: 'rechazada' }, CONTEXTO_NEW)).toEqual([
      { tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' },
    ])
    expect(bandsStatus({ estado: 'borrador' }, CONTEXTO_NEW)).toEqual([])
  })
})

describe('pendientesVisibles', () => {
  it.each([
    { variables: ['equipo_descripcion'] as const, texts: ['Descripción del equipo'] },
    { variables: ['capacidad'] as const, texts: ['Capacidad del equipo'] },
    { variables: ['capacidad', 'equipo_descripcion'] as const, texts: ['Capacidad del equipo', 'Descripción del equipo'] },
  ])('nombra los datos incompletos de un equipo ya seleccionado: $variables', ({ variables, texts }) => {
    const { missing } = pendingListVisible(
      { ...WITHOUT_PENDING_LIST, variables: [...variables] },
      { items: [], equipoId: ID },
    )
    expect(missing.map(({ texto }) => texto)).toEqual(texts)
    expect(missing.every(({ destination }) => destination === 'cotizacion-equipo')).toBe(true)
  })

  it('lista cada campo una vez, con su etiqueta y el id al que va el foco', () => {
    const { missing } = pendingListVisible(
      { ...WITHOUT_PENDING_LIST, variables: ['capacidad', 'equipo_descripcion', 'ubicacion', 'validez_dias'] },
      { items: [], equipoId: '' },
    )
    expect(missing).toEqual([
      { clave: 'variable-capacidad', texto: 'Equipo', destination: 'cotizacion-equipo' },
      { clave: 'variable-ubicacion', texto: 'Lugar del servicio', destination: 'cotizacion-dato-ubicacion' },
      { clave: 'variable-validez_dias', texto: 'Validez (días)', destination: 'cotizacion-validez' },
    ])
  })

  it('el número no tiene campo: se nombra sin llevar el foco', () => {
    expect(pendingListVisible({ ...WITHOUT_PENDING_LIST, variables: ['numero'] }, { items: [], equipoId: '' }).missing).toEqual([
      { clave: 'variable-numero', texto: 'Número de cotización', destination: null },
    ])
  })

  it('los ítems sin precio llevan al primer precio vacío o ilegible', () => {
    const { missing } = pendingListVisible(
      { ...WITHOUT_PENDING_LIST, itemsWithoutPrice: 2 },
      { items: [item('a', '1.950.000'), item('b', ''), item('c', ' ')], equipoId: '' },
    )
    expect(missing).toEqual([{ clave: 'items-sin-precio', texto: '2 ítems sin precio', destination: idPriceItem('b') }])
    expect(
      pendingListVisible({ ...WITHOUT_PENDING_LIST, itemsWithoutPrice: 1 }, { items: [item('a', '1.950.000'), item('b', '19,5,0')], equipoId: '' })
        .missing[0].destination,
    ).toBe(idPriceItem('b'))
    expect(pendingListVisible({ ...WITHOUT_PENDING_LIST, itemsWithoutPrice: 1 }, { items: [item('b', '')], equipoId: '' }).missing[0].texto).toBe(
      '1 ítem sin precio',
    )
  })

  it('sin ítems y variables mal escritas', () => {
    expect(pendingListVisible({ ...WITHOUT_PENDING_LIST, withoutItems: true, desconocidas: ['ubicación'] }, { items: [], equipoId: '' })).toEqual({
      missing: [{ clave: 'sin-items', texto: 'al menos un ítem', destination: null }],
      malEscritas: ['{{ubicación}}'],
    })
  })
})
