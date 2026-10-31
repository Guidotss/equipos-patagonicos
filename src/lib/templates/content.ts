import { z } from 'zod'

export const FORMATOS = { mensual: 'Mensual', jornada: 'Por jornada' } as const
export type Format = keyof typeof FORMATOS

export const UNIDADES = ['UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE'] as const
export type Unit = (typeof UNIDADES)[number]

/**
 * Un bloque de texto de la plantilla o de la cotización. Se leen las marcas actuales y las guardadas como
 * `oculto` antes del renombrado, y se expone siempre `hidden`. Sin marca, el bloque queda visible.
 */
export const schemaBlock = z.object({
  titulo: z.string(),
  contenido: z.string(),
  hidden: z.boolean().optional(),
  oculto: z.boolean().optional(),
}).transform(({ titulo, contenido, hidden, oculto }) => ({
  titulo,
  contenido,
  hidden: hidden ?? oculto ?? false,
}))
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
