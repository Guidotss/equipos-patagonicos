import { z } from 'zod'

export const FORMATOS = { mensual: 'Mensual', jornada: 'Por jornada' } as const
export type Formato = keyof typeof FORMATOS

export const UNIDADES = ['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'] as const
export type Unidad = (typeof UNIDADES)[number]

/**
 * Un bloque de texto de la plantilla o de la cotización. `oculto`: se guarda con la cotización pero no sale en el
 * PDF, así "Mostrar" lo recupera tal cual estaba. Los bloques guardados antes de existir la marca se leen visibles.
 */
export const esquemaBloque = z.object({ titulo: z.string(), contenido: z.string(), oculto: z.boolean().default(false) })
export type Bloque = z.infer<typeof esquemaBloque>

export const esquemaItemPlantilla = z.object({
  seccion: z.string(),
  descripcion: z.string(),
  unidad: z.enum(UNIDADES),
  cantidad: z.number().positive(),
})
export type ItemPlantilla = z.infer<typeof esquemaItemPlantilla>

/** Valida el jsonb `bloques` de plantillas/cotizaciones. Lanza si no tiene la forma esperada. */
export function leerBloques(valor: unknown): Bloque[] {
  return z.array(esquemaBloque).parse(valor)
}

export function leerItemsPlantilla(valor: unknown): ItemPlantilla[] {
  return z.array(esquemaItemPlantilla).parse(valor)
}
