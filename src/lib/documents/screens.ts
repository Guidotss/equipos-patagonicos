import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { centsToDecimal, parseAmountCents } from '@/lib/finance/amounts'
import { schemaFinance } from '@/lib/finance/schemas'
import type { FinanceByDocument } from '@/lib/finance/contracts'
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
    finance: schemaFinance.optional(),
    paymentCondition: z.string().max(200, 'Máximo 200 caracteres').optional(),
    archivos: z.array(schemaFileSubido).max(50),
    quitar: ids.default([]),
    remitos: ids.default([]),
    aplicaciones: z
      .array(
        z.object({
          factura_id: z.uuid(),
          monto_aplicado: z.string().transform((value, ctx) => {
            const cents = parseAmountCents(value)
            if (cents === null || cents <= BigInt(0)) {
              ctx.addIssue({ code: 'custom', message: 'Ingresá un monto aplicado válido' })
              return z.NEVER
            }
            return centsToDecimal(cents)
          }),
        }),
      )
      .max(200)
      .optional(),
    cotizacion: z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }) }).optional(),
  })
  .superRefine((entrada, ctx) => {
    if (entrada.finance !== undefined && entrada.aplicaciones !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['finance'], message: 'Usá la distribución financiera sin aplicaciones anteriores simultáneas' })
    }
    if (entrada.finance && entrada.id && entrada.finance.expectedVersion === undefined) {
      ctx.addIssue({ code: 'custom', path: ['finance', 'expectedVersion'], message: 'Falta la versión financiera leída. Volvé a abrir el documento' })
    }
    if (entrada.finance && entrada.datos.tipo !== 'factura' && entrada.datos.tipo !== 'orden_pago') {
      ctx.addIssue({ code: 'custom', path: ['finance'], message: 'Solo facturas y órdenes de pago admiten datos financieros' })
    }
    if (entrada.finance && ((entrada.datos.tipo === 'factura' && (entrada.finance.paymentInstruments !== undefined || entrada.finance.paymentAllocations !== undefined))
      || (entrada.datos.tipo === 'orden_pago' && entrada.finance.invoiceAllocations !== undefined))) {
      ctx.addIssue({ code: 'custom', path: ['finance'], message: 'La distribución no corresponde al tipo de documento' })
    }
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
export type Invoice = Database['public']['Views']['v_facturas']['Row'] & { exact_balance: string | null; exact_available?: string | null }
export type Budget = Database['public']['Views']['v_presupuestos']['Row']
export type OptionBudget = {
  id: string
  numero: number
  cliente_id: string
  cliente_razon_social: string
  asunto: string
  presupuesto_estado: string
}
export type DocumentContext = {
  budgets: (OptionBudget & { equipmentId: string | null })[]
  documentos: Document[]
  facturas: Invoice[]
  financeByDocument: FinanceByDocument
  equipos: { id: string; nombre: string; activo?: boolean }[]
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
