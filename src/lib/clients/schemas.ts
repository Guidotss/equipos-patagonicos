import { z } from 'zod'
import { cuitOptional, emailOptional, textOptional, textRequired } from '@/lib/validation'

export const CONDICIONES_IVA = {
  responsable_inscripto: 'Responsable inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  consumidor_final: 'Consumidor final',
} as const

const VALUES_IVA = ['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'] as const

export const FIELDS_CLIENT = [
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
export type FieldClient = (typeof FIELDS_CLIENT)[number]

export const schemaClient = z.object({
  razon_social: textRequired('Ingresá la razón social'),
  cuit: cuitOptional,
  condicion_iva: z
    .enum(['', ...VALUES_IVA], { error: 'Elegí una condición de IVA válida' })
    .transform((value) => (value === '' ? null : value)),
  direccion: textOptional(),
  localidad: textOptional(100),
  provincia: textOptional(100),
  telefono: textOptional(100),
  email: emailOptional,
  condicion_pago: textOptional(),
  notas: textOptional(2000),
})

export const FIELDS_CONTACT = ['nombre', 'cargo', 'email', 'telefono'] as const
export type FieldContact = (typeof FIELDS_CONTACT)[number]

export const schemaContact = z.object({
  nombre: textRequired('Ingresá el nombre', 150),
  cargo: textOptional(150),
  email: emailOptional,
  telefono: textOptional(100),
})
