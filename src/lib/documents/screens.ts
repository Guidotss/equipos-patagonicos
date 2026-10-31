import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { parsePrice } from '@/lib/format/amounts'
import { schemaDocument } from './schemas'

const ids = z
  .array(z.uuid())
  .max(200)
  .refine((list) => new Set(list).size === list.length, 'Hay vínculos repetidos')
export const schemaFileSubido = z.object({
  path: z.string().regex(/^documentos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/),
  nombre_original: z.string().trim().min(1, 'Falta el nombre del archivo').max(255, 'Máximo 255 caracteres'),
})
export const schemaSaveDocument = z
  .object({
    id: z.uuid().optional(),
    clientId: z.uuid(),
    budgets: ids.min(1, 'Elegí al menos un presupuesto'),
    datos: schemaDocument,
    archivos: z.array(schemaFileSubido).max(50),
    quitar: ids.default([]),
    remitos: ids.default([]),
    aplicaciones: z
      .array(
        z.object({
          factura_id: z.uuid(),
          monto_aplicado: z.string().transform((value, ctx) => {
            const monto = parsePrice(value)
            if (monto === null || monto <= 0 || monto > 999_999_999_999.99) {
              ctx.addIssue({ code: 'custom', message: 'Ingresá un monto aplicado válido' })
              return z.NEVER
            }
            return monto
          }),
        }),
      )
      .max(200)
      .default([]),
    cotizacion: z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }) }).optional(),
  })
  .superRefine((entrada, ctx) => {
    if (!entrada.id && entrada.archivos.length === 0)
      ctx.addIssue({ code: 'custom', path: ['archivos'], message: 'Subí al menos un archivo' })
    const folder = `documentos/${entrada.clientId}/`
    if (entrada.archivos.some((archivo) => !archivo.path.startsWith(folder)))
      ctx.addIssue({ code: 'custom', path: ['archivos'], message: 'El archivo no corresponde al cliente' })
    if (
      entrada.cotizacion &&
      (entrada.datos.tipo !== 'orden_compra' ||
        entrada.id ||
        entrada.budgets.length !== 1 ||
        entrada.budgets[0] !== entrada.cotizacion.id)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cotizacion'],
        message: 'La aprobación requiere una orden de compra de esta cotización',
      })
    }
  })

export type Document = Database['public']['Tables']['documentos']['Row']
export type FileDocument = Database['public']['Tables']['documento_archivos']['Row']
export type Invoice = Database['public']['Views']['v_facturas']['Row']
export type Budget = Database['public']['Views']['v_presupuestos']['Row']
export type OptionBudget = {
  id: string
  numero: number
  cliente_id: string
  cliente_razon_social: string
  asunto: string
  presupuesto_estado: string
}
export type ContextoDocument = {
  budgets: OptionBudget[]
  documentos: Document[]
  facturas: Invoice[]
  equipos: { id: string; nombre: string }[]
}

export const STATUSES_COBRO: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  vencida: 'Vencida',
  cobrada: 'Cobrada',
  no_aplica: 'No aplica',
}
export function numberDocument(document: Pick<Document, 'numero' | 'tipo_comprobante'>) {
  return [document.tipo_comprobante, document.numero || 'Sin número'].filter(Boolean).join(' ')
}
