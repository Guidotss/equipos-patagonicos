import { z } from 'zod'
import { cuitOptional, emailOptional, numberPositiveOptional, textOptional, textRequired } from '@/lib/validation'

export const FIELDS_COMPANY = [
  'razon_social',
  'cuit',
  'direccion',
  'ciudad',
  'provincia',
  'telefono',
  'email',
  'web',
  'indice_base',
  'proxima_actualizacion',
] as const
export type FieldCompany = (typeof FIELDS_COMPANY)[number]

export const schemaCompany = z.object({
  razon_social: textRequired('Ingresá la razón social'),
  cuit: cuitOptional,
  direccion: textOptional(),
  ciudad: textOptional(100),
  provincia: textOptional(100),
  telefono: textOptional(100),
  email: emailOptional,
  web: textOptional(),
  indice_base: textOptional(100),
  proxima_actualizacion: textOptional(100),
})

export const FIELDS_SIGNER = ['nombre', 'cargo', 'telefono', 'email'] as const
export type FieldSigner = (typeof FIELDS_SIGNER)[number]

export const schemaSigner = z.object({
  nombre: textRequired('Ingresá el nombre', 150),
  cargo: textOptional(150),
  telefono: textOptional(100),
  email: emailOptional,
})

export const FIELDS_EQUIPMENT = ['nombre', 'capacidad_tn', 'marca', 'modelo', 'identificacion', 'descripcion'] as const
export type FieldEquipment = (typeof FIELDS_EQUIPMENT)[number]

export const schemaEquipment = z.object({
  nombre: textRequired('Ingresá el nombre del equipo', 150),
  capacidad_tn: numberPositiveOptional('Ingresá una capacidad en toneladas mayor a 0').refine(
    (capacity) => capacity === null || capacity < 100_000,
    'La capacidad tiene que ser menor a 100.000 TN',
  ),
  marca: textOptional(100),
  modelo: textOptional(100),
  identificacion: textOptional(100),
  descripcion: textOptional(2000),
})

export const schemaNameTemplate = z.object({
  nombre: textRequired('Ingresá el nombre de la plantilla', 100),
})
