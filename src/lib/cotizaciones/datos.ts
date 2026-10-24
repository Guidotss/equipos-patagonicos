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

export const esquemaItem = z.object({
  seccion: z.string().trim().max(100).default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999),
  precio_unitario: z.number().nonnegative('El precio no puede ser negativo').max(999_999_999_999).nullable(),
  unidad: z.enum(UNIDADES),
})
export type ItemCotizacion = z.infer<typeof esquemaItem>
