import { z } from 'zod'
import { UNIDADES } from '@/lib/plantillas/contenido'

/** Variables que se cargan por cotización (jsonb `datos`). El resto sale del equipo, la empresa o la cotización. */
export const CAMPOS_DATOS = [
  'ubicacion',
  'horario',
  'plazo_entrega',
  'duracion_estimada',
  'forma_pago',
  'disponibilidad',
  'indice_base',
  'proxima_actualizacion',
] as const
export type CampoDatos = (typeof CAMPOS_DATOS)[number]

const texto = z.string().trim().max(500, 'Máximo 500 caracteres').default('')

export const esquemaDatos = z.object({
  ubicacion: texto,
  horario: texto,
  plazo_entrega: texto,
  duracion_estimada: texto,
  forma_pago: texto,
  disponibilidad: texto,
  indice_base: texto,
  proxima_actualizacion: texto,
})
export type DatosCotizacion = z.infer<typeof esquemaDatos>

/** Lee el jsonb `datos` sin fallar: lo que no sea texto queda en "". El largo se valida al guardar (esquemaDatos). */
export function leerDatos(valor: unknown): DatosCotizacion {
  const objeto = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}
  return Object.fromEntries(
    CAMPOS_DATOS.map((campo) => [campo, typeof objeto[campo] === 'string' ? (objeto[campo] as string).trim() : '']),
  ) as DatosCotizacion
}

// Todos los mensajes en castellano: el editor los muestra junto a cada celda de la grilla.
export const esquemaItem = z.object({
  seccion: z.string().trim().max(100, 'Máximo 100 caracteres').default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500, 'Máximo 500 caracteres'),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999, 'La cantidad es demasiado grande'),
  precio_unitario: z
    .number()
    .nonnegative('El precio no puede ser negativo')
    .max(999_999_999_999, 'El precio es demasiado grande')
    .nullable(),
  unidad: z.enum(UNIDADES, { error: 'Elegí la unidad' }),
})
export type ItemCotizacion = z.infer<typeof esquemaItem>
