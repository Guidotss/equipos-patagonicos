import { describe, expect, it } from 'vitest'
import { deliveryNoteEquipment, hasSelectedBudgetContext } from './equipment'
import type { DocumentContext } from './screens'

function contextWithEquipment(
  equipmentIds: (string | null)[],
): DocumentContext {
  return {
    budgets: equipmentIds.map((equipmentId, index) => ({
      id: String(index),
      numero: index,
      cliente_id: 'client',
      cliente_razon_social: 'Cliente',
      asunto: 'Trabajo',
      presupuesto_estado: 'en_curso',
      equipmentId,
    })),
    documentos: [],
    facturas: [],
    invoiceBudgetIds: {},
    financeByDocument: {},
    equipos: [{ id: 'crane', nombre: 'Grúa histórica' }],
  }
}

describe('equipo del remito administrativo', () => {
  it.each([
    [['crane'], 'crane', false],
    [['crane', 'crane'], 'crane', false],
    [[null, null], null, false],
    [['crane', null], null, true],
    [['crane', 'other'], null, true],
  ] as const)('resuelve los presupuestos %s', (ids, id, ambiguous) => {
    const context = contextWithEquipment([...ids])
    expect(
      deliveryNoteEquipment(
        context,
        context.budgets.map((budget) => budget.id),
      ),
    ).toMatchObject({ id, ambiguous })
  })

  it('muestra el nombre histórico y el estado sin asignación', () => {
    expect(
      deliveryNoteEquipment(contextWithEquipment(['crane']), ['0']).name,
    ).toBe('Grúa histórica')
    expect(
      deliveryNoteEquipment(contextWithEquipment([null]), ['0']).name,
    ).toBe('Sin equipo asignado')
  })

  it.each(['crane', null])(
    'conserva el equipo real %s al editar aunque cambien los presupuestos',
    (id) => {
      expect(
        deliveryNoteEquipment(
          contextWithEquipment(['other', null]),
          ['0', '1'],
          { tipo: 'remito', equipo_id: id },
        ),
      ).toMatchObject({ id, ambiguous: false })
    },
  )

  it('deriva el equipo al convertir otro documento en remito', () => {
    expect(
      deliveryNoteEquipment(contextWithEquipment(['crane']), ['0'], {
        tipo: 'orden_compra',
        equipo_id: null,
      }).id,
    ).toBe('crane')
  })
})

describe('disponibilidad del contexto seleccionado', () => {
  it('distingue un equipo nulo conocido de un presupuesto pendiente de cargar', () => {
    const context = contextWithEquipment([null])
    expect(hasSelectedBudgetContext(context, ['0'])).toBe(true)
    expect(hasSelectedBudgetContext(context, ['missing'])).toBe(false)
    expect(hasSelectedBudgetContext(context, ['0', 'missing'])).toBe(false)
    expect(hasSelectedBudgetContext(context, [])).toBe(false)
    expect(hasSelectedBudgetContext({ ...context, budgets: [] }, ['0'])).toBe(
      false,
    )
  })
})
