import { z } from 'zod'
import { parsePrecio } from '@/lib/format/montos'
import { esUuid } from '@/lib/validacion'

export const TIPOS_DOCUMENTO = {
  orden_compra: 'Orden de compra',
  remito: 'Remito',
  factura: 'Factura',
  orden_pago: 'Orden de pago',
} as const
export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

export const TIPOS_COMPROBANTE = {
  FA: 'Factura A',
  FCE_A: 'Factura de crédito electrónica MiPyME A',
  FB: 'Factura B',
  ND: 'Nota de débito',
  NC: 'Nota de crédito',
} as const
export type TipoComprobante = keyof typeof TIPOS_COMPROBANTE

export const CAMPOS_DOCUMENTO = [
  'tipo',
  'numero',
  'fecha',
  'monto',
  'tipo_comprobante',
  'fecha_vencimiento',
  'numero_oc_ref',
  'periodo_desde',
  'periodo_hasta',
  'equipo_id',
  'notas',
] as const

const fechaOpcional = z
  .string()
  .trim()
  .refine((valor) => valor === '' || z.iso.date().safeParse(valor).success, 'Fecha inválida')
  .transform((valor) => (valor === '' ? null : valor))

const montoOpcional = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor === '') return null
    const monto = parsePrecio(valor)
    if (monto === null || monto <= 0 || monto > 999_999_999_999) {
      ctx.addIssue({ code: 'custom', message: 'Monto inválido' })
      return z.NEVER
    }
    return monto
  })

export const esquemaDocumento = z
  .object({
    tipo: z.enum(['orden_compra', 'remito', 'factura', 'orden_pago'], { error: 'Elegí el tipo de documento' }),
    numero: z.string().trim().max(50, 'Máximo 50 caracteres'),
    fecha: fechaOpcional,
    monto: montoOpcional,
    tipo_comprobante: z
      .union([z.enum(['FA', 'FCE_A', 'FB', 'ND', 'NC'], { error: 'Elegí un comprobante válido' }), z.literal('')])
      .transform((valor) => (valor === '' ? null : valor)),
    fecha_vencimiento: fechaOpcional,
    numero_oc_ref: z.string().trim().max(50, 'Máximo 50 caracteres'),
    periodo_desde: fechaOpcional,
    periodo_hasta: fechaOpcional,
    equipo_id: z
      .string()
      .trim()
      .refine((valor) => valor === '' || esUuid(valor), 'Equipo inválido')
      .transform((valor) => (valor === '' ? null : valor)),
    notas: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  })
  .superRefine((datos, ctx) => {
    if ((datos.tipo === 'factura' || datos.tipo === 'orden_pago') && datos.monto === null) {
      ctx.addIssue({ code: 'custom', path: ['monto'], message: 'Ingresá el monto' })
    }
    if (datos.tipo === 'factura' && datos.tipo_comprobante === null) {
      ctx.addIssue({ code: 'custom', path: ['tipo_comprobante'], message: 'Elegí el tipo de comprobante' })
    }
    if (datos.tipo === 'remito' && datos.periodo_desde && datos.periodo_hasta && datos.periodo_desde > datos.periodo_hasta) {
      ctx.addIssue({ code: 'custom', path: ['periodo_hasta'], message: 'El período termina antes de empezar' })
    }
  })
  // Lo que no corresponde al tipo se vacía: la base lo exige (CHECKs por tipo).
  .transform((datos) => ({
    ...datos,
    tipo_comprobante: datos.tipo === 'factura' ? datos.tipo_comprobante : null,
    fecha_vencimiento: datos.tipo === 'factura' ? datos.fecha_vencimiento : null,
    numero_oc_ref: datos.tipo === 'factura' ? datos.numero_oc_ref : '',
    periodo_desde: datos.tipo === 'remito' ? datos.periodo_desde : null,
    periodo_hasta: datos.tipo === 'remito' ? datos.periodo_hasta : null,
    equipo_id: datos.tipo === 'remito' ? datos.equipo_id : null,
  }))
export type DatosDocumento = z.output<typeof esquemaDocumento>
