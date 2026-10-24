'use server'

import { revalidatePath } from 'next/cache'
import { requireUsuario } from '@/lib/auth'
import {
  CAMPOS_EMPRESA,
  CAMPOS_EQUIPO,
  CAMPOS_FIRMANTE,
  esquemaEmpresa,
  esquemaEquipo,
  esquemaFirmante,
  esquemaNombrePlantilla,
} from '@/lib/catalogos/esquemas'
import {
  exito,
  falloBase,
  falloValidacion,
  leerCampos,
  mensajeErrorBase,
  type EstadoFormulario,
} from '@/lib/formularios'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

function exigirUuid(id: string) {
  if (!esUuid(id)) throw new Error('Identificador inválido')
}

export async function actualizarEmpresa(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const usuario = await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_EMPRESA)
  if (usuario.rol !== 'admin') return { ok: false, mensaje: 'Solo un administrador puede cambiar estos datos', errores: {}, valores }
  const datos = esquemaEmpresa.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('empresa_config').update(datos.data).eq('id', true)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/empresa')
  return exito('Datos de la empresa guardados')
}

export async function crearFirmante(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_FIRMANTE)
  const datos = esquemaFirmante.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').insert(datos.data)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/firmantes')
  return exito('Firmante agregado')
}

export async function actualizarFirmante(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_FIRMANTE)
  const datos = esquemaFirmante.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/firmantes')
  return exito('Firmante guardado')
}

export async function cambiarEstadoFirmante(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/firmantes')
}

export async function crearEquipo(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_EQUIPO)
  const datos = esquemaEquipo.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').insert(datos.data)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/equipos')
  return exito('Equipo agregado')
}

export async function actualizarEquipo(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_EQUIPO)
  const datos = esquemaEquipo.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores)

  revalidatePath('/configuracion/equipos')
  return exito('Equipo guardado')
}

export async function cambiarEstadoEquipo(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/equipos')
}

export async function renombrarPlantilla(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, ['nombre'] as const)
  const datos = esquemaNombrePlantilla.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores, { campo: 'nombre', mensaje: 'Ya existe una plantilla con ese nombre' })

  revalidatePath('/configuracion/plantillas')
  revalidatePath(`/configuracion/plantillas/${id}`)
  return exito('Plantilla renombrada')
}

export async function cambiarEstadoPlantilla(id: string, activa: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update({ activa }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/configuracion/plantillas')
}
