import { z } from 'zod'
import { UNITS } from '@/lib/templates/content'

/** Variables que se cargan por cotización (jsonb `datos`). El resto sale del equipo, la empresa o la cotización. */
export const FIELDS_DATA = [
  'ubicacion',
  'horario',
  'plazo_entrega',
  'duracion_estimada',
  'forma_pago',
  'disponibilidad',
  'indice_base',
  'proxima_actualizacion',
] as const
export type FieldData = (typeof FIELDS_DATA)[number]

const texto = z.string().trim().max(500, 'Máximo 500 caracteres').default('')

export const schemaData = z.object({
  ubicacion: texto,
  horario: texto,
  plazo_entrega: texto,
  duracion_estimada: texto,
  forma_pago: texto,
  disponibilidad: texto,
  indice_base: texto,
  proxima_actualizacion: texto,
})
export type DataQuote = z.infer<typeof schemaData>

/** Lee el jsonb `datos` sin fallar: lo que no sea texto queda en "". El largo se valida al guardar (esquemaDatos). */
export function readData(value: unknown): DataQuote {
  const object = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    FIELDS_DATA.map((field) => [field, typeof object[field] === 'string' ? (object[field] as string).trim() : '']),
  ) as DataQuote
}

// Todos los mensajes en castellano: el editor los muestra junto a cada celda de la grilla.
export const schemaItem = z.object({
  seccion: z.string().trim().max(100, 'Máximo 100 caracteres').default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500, 'Máximo 500 caracteres'),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999, 'La cantidad es demasiado grande'),
  precio_unitario: z
    .number()
    .nonnegative('El precio no puede ser negativo')
    .max(999_999_999_999, 'El precio es demasiado grande')
    .nullable(),
  unidad: z.enum(UNITS, { error: 'Elegí la unidad' }),
})
export type ItemQuote = z.infer<typeof schemaItem>
