import { z } from 'zod'
import { cuitOpcional, emailOpcional, textoOpcional, textoRequerido } from '@/lib/validacion'

export const CONDICIONES_IVA = {
  responsable_inscripto: 'Responsable inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  consumidor_final: 'Consumidor final',
} as const

const VALORES_IVA = ['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'] as const

export const CAMPOS_CLIENTE = [
  'razon_social',
  'cuit',
  'condicion_iva',
  'direccion',
  'localidad',
  'provincia',
  'telefono',
  'email',
  'condicion_pago',
  'notas',
] as const
export type CampoCliente = (typeof CAMPOS_CLIENTE)[number]

export const esquemaCliente = z.object({
  razon_social: textoRequerido('Ingresá la razón social'),
  cuit: cuitOpcional,
  condicion_iva: z
    .union([z.enum(VALORES_IVA, { error: 'Elegí una condición de IVA válida' }), z.literal('')])
    .transform((valor) => (valor === '' ? null : valor)),
  direccion: textoOpcional(),
  localidad: textoOpcional(100),
  provincia: textoOpcional(100),
  telefono: textoOpcional(100),
  email: emailOpcional,
  condicion_pago: textoOpcional(),
  notas: textoOpcional(2000),
})

export const CAMPOS_CONTACTO = ['nombre', 'cargo', 'email', 'telefono'] as const
export type CampoContacto = (typeof CAMPOS_CONTACTO)[number]

export const esquemaContacto = z.object({
  nombre: textoRequerido('Ingresá el nombre', 150),
  cargo: textoOpcional(150),
  email: emailOpcional,
  telefono: textoOpcional(100),
})
