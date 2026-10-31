import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { parsePrecio } from '@/lib/format/montos'
import { esquemaDocumento } from './esquemas'

const ids = z
  .array(z.uuid())
  .max(200)
  .refine((lista) => new Set(lista).size === lista.length, 'Hay vínculos repetidos')
export const esquemaArchivoSubido = z.object({
  path: z.string().regex(/^documentos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/),
  nombre_original: z.string().trim().min(1, 'Falta el nombre del archivo').max(255, 'Máximo 255 caracteres'),
})
export const esquemaGuardarDocumento = z
  .object({
    id: z.uuid().optional(),
    clienteId: z.uuid(),
    presupuestos: ids.min(1, 'Elegí al menos un presupuesto'),
    datos: esquemaDocumento,
    archivos: z.array(esquemaArchivoSubido).max(50),
    quitar: ids.default([]),
    remitos: ids.default([]),
    aplicaciones: z
      .array(
        z.object({
          factura_id: z.uuid(),
          monto_aplicado: z.string().transform((valor, ctx) => {
            const monto = parsePrecio(valor)
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
    const carpeta = `documentos/${entrada.clienteId}/`
    if (entrada.archivos.some((archivo) => !archivo.path.startsWith(carpeta)))
      ctx.addIssue({ code: 'custom', path: ['archivos'], message: 'El archivo no corresponde al cliente' })
    if (
      entrada.cotizacion &&
      (entrada.datos.tipo !== 'orden_compra' ||
        entrada.id ||
        entrada.presupuestos.length !== 1 ||
        entrada.presupuestos[0] !== entrada.cotizacion.id)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cotizacion'],
        message: 'La aprobación requiere una orden de compra de esta cotización',
      })
    }
  })

export type Documento = Database['public']['Tables']['documentos']['Row']
export type ArchivoDocumento = Database['public']['Tables']['documento_archivos']['Row']
export type Factura = Database['public']['Views']['v_facturas']['Row']
export type Presupuesto = Database['public']['Views']['v_presupuestos']['Row']
export type OpcionPresupuesto = {
  id: string
  numero: number
  cliente_id: string
  cliente_razon_social: string
  asunto: string
  presupuesto_estado: string
}
export type ContextoDocumento = {
  presupuestos: OpcionPresupuesto[]
  documentos: Documento[]
  facturas: Factura[]
  equipos: { id: string; nombre: string }[]
}

export const ESTADOS_COBRO: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  vencida: 'Vencida',
  cobrada: 'Cobrada',
  no_aplica: 'No aplica',
}
export function numeroDocumento(documento: Pick<Documento, 'numero' | 'tipo_comprobante'>) {
  return [documento.tipo_comprobante, documento.numero || 'Sin número'].filter(Boolean).join(' ')
}
