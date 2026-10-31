import { z } from 'zod'
import { normalizarCuit } from '@/lib/cuit'
import { parsePrecio } from '@/lib/format/montos'

export function textoRequerido(mensaje: string, max = 200) {
  return z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`)
}

export function textoOpcional(max = 200) {
  return z.string().trim().max(max, `Máximo ${max} caracteres`)
}

export const emailOpcional = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres')
  .refine((valor) => valor === '' || z.email().safeParse(valor).success, 'El email no es válido')

/** CUIT informado sin validación fiscal; vacío → null. */
export const cuitOpcional = z
  .string()
  .transform(normalizarCuit)
  .transform((cuit) => (cuit === '' ? null : cuit))

/** Número positivo opcional escrito al estilo argentino ("60,5"); vacío → null. */
export function numeroPositivoOpcional(mensaje: string) {
  return z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor === '') return null
      const numero = parsePrecio(valor)
      if (numero === null || numero <= 0) {
        ctx.addIssue({ code: 'custom', message: mensaje })
        return z.NEVER
      }
      return numero
    })
}

export function esUuid(valor: string): boolean {
  return z.uuid().safeParse(valor).success
}
