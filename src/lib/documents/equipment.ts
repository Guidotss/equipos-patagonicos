import type { Document, DocumentContext } from './screens'

export const AMBIGUOUS_EQUIPMENT_MESSAGE =
  'Los presupuestos seleccionados tienen equipos diferentes. Creá remitos separados para cada equipo y para los presupuestos sin equipo asignado.'

export function hasSelectedBudgetContext(
  context: DocumentContext,
  budgetIds: string[],
) {
  return (
    budgetIds.length > 0 &&
    budgetIds.every((id) => context.budgets.some((budget) => budget.id === id))
  )
}

export function deliveryNoteEquipment(
  context: DocumentContext,
  budgetIds: string[],
  document?: Pick<Document, 'tipo' | 'equipo_id'>,
) {
  // El equipo de un remito existente registra lo que trabajó, incluso si difiere del presupuesto.
  const equipmentIds =
    document?.tipo === 'remito'
      ? [document.equipo_id]
      : context.budgets
          .filter((budget) => budgetIds.includes(budget.id))
          .map((budget) => budget.equipmentId)
  const distinctIds = new Set(equipmentIds)
  const ambiguous = distinctIds.size > 1
  const id = ambiguous ? null : (equipmentIds[0] ?? null)
  const name = id
    ? context.equipos.find((equipment) => equipment.id === id)?.nombre
    : undefined
  return {
    id,
    ambiguous,
    name: name ?? (id ? 'Equipo registrado' : 'Sin equipo asignado'),
  }
}
