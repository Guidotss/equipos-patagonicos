/** "60.5" (numeric de Postgres) → "60,5" para mostrar y editar. */
export function capacidadTexto(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',')
}

/** Variables de las plantillas que salen de la ficha del equipo. */
export const VARIABLES_EQUIPO = ['capacidad', 'equipo_descripcion'] as const
