import { z } from 'zod'
import { cuitOpcional, emailOpcional, numeroPositivoOpcional, textoOpcional, textoRequerido } from '@/lib/validacion'

export const CAMPOS_EMPRESA = [
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
export type CampoEmpresa = (typeof CAMPOS_EMPRESA)[number]

export const esquemaEmpresa = z.object({
  razon_social: textoRequerido('Ingresá la razón social'),
  cuit: cuitOpcional,
  direccion: textoOpcional(),
  ciudad: textoOpcional(100),
  provincia: textoOpcional(100),
  telefono: textoOpcional(100),
  email: emailOpcional,
  web: textoOpcional(),
  indice_base: textoOpcional(100),
  proxima_actualizacion: textoOpcional(100),
})

export const CAMPOS_FIRMANTE = ['nombre', 'cargo', 'telefono', 'email'] as const
export type CampoFirmante = (typeof CAMPOS_FIRMANTE)[number]

export const esquemaFirmante = z.object({
  nombre: textoRequerido('Ingresá el nombre', 150),
  cargo: textoOpcional(150),
  telefono: textoOpcional(100),
  email: emailOpcional,
})

export const CAMPOS_EQUIPO = ['nombre', 'capacidad_tn', 'marca', 'modelo', 'identificacion', 'descripcion'] as const
export type CampoEquipo = (typeof CAMPOS_EQUIPO)[number]

export const esquemaEquipo = z.object({
  nombre: textoRequerido('Ingresá el nombre del equipo', 150),
  capacidad_tn: numeroPositivoOpcional('Ingresá una capacidad en toneladas mayor a 0').refine(
    (capacidad) => capacidad === null || capacidad < 100_000,
    'La capacidad tiene que ser menor a 100.000 TN',
  ),
  marca: textoOpcional(100),
  modelo: textoOpcional(100),
  identificacion: textoOpcional(100),
  descripcion: textoOpcional(2000),
})

export const esquemaNombrePlantilla = z.object({
  nombre: textoRequerido('Ingresá el nombre de la plantilla', 100),
})
