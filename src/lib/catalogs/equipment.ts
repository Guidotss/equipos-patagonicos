/** "60.5" (numeric de Postgres) → "60,5" para mostrar y editar. */
export function capacityText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}

/** Variables de las plantillas que salen de la ficha del equipo. */
export const VARIABLES_EQUIPMENT = ['capacidad', 'equipo_descripcion'] as const
