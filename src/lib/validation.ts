import { z } from 'zod'
import { normalizeCuit } from '@/lib/cuit'
import { parsePrice } from '@/lib/format/amounts'

export function textRequired(message: string, max = 200) {
  return z.string().trim().min(1, message).max(max, `Máximo ${max} caracteres`)
}

export function textOptional(max = 200) {
  return z.string().trim().max(max, `Máximo ${max} caracteres`)
}

export const emailOptional = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres')
  .refine((value) => value === '' || z.email().safeParse(value).success, 'El email no es válido')

/** CUIT informado sin validación fiscal; vacío → null. */
export const cuitOptional = z
  .string()
  .transform(normalizeCuit)
  .transform((cuit) => (cuit === '' ? null : cuit))

/** Número positivo opcional escrito al estilo argentino ("60,5"); vacío → null. */
export function numberPositiveOptional(message: string) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null
      const numero = parsePrice(value)
      if (numero === null || numero <= 0) {
        ctx.addIssue({ code: 'custom', message: message })
        return z.NEVER
      }
      return numero
    })
}

export function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success
}
