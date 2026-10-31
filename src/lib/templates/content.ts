import { z } from 'zod'

export const FORMATOS = { mensual: 'Mensual', jornada: 'Por jornada' } as const
export type Format = keyof typeof FORMATOS

export const UNIDADES = ['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'] as const
export type Unit = (typeof UNIDADES)[number]

/**
 * Un bloque de texto de la plantilla o de la cotización. `oculto`: se guarda con la cotización pero no sale en el
 * PDF, así "Mostrar" lo recupera tal cual estaba. Los bloques guardados antes de existir la marca se leen visibles.
 */
export const schemaBlock = z.object({ titulo: z.string(), contenido: z.string(), hidden: z.boolean().default(false) })
export type Block = z.infer<typeof schemaBlock>

export const schemaItemTemplate = z.object({
  seccion: z.string(),
  descripcion: z.string(),
  unidad: z.enum(UNIDADES),
  cantidad: z.number().positive(),
})
export type ItemTemplate = z.infer<typeof schemaItemTemplate>

/** Valida el jsonb `bloques` de plantillas/cotizaciones. Lanza si no tiene la forma esperada. */
export function readBlocks(value: unknown): Block[] {
  return z.array(schemaBlock).parse(value)
}

export function readItemsTemplate(value: unknown): ItemTemplate[] {
  return z.array(schemaItemTemplate).parse(value)
}
