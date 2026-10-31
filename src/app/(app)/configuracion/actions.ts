'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import {
  FIELDS_COMPANY,
  FIELDS_EQUIPMENT,
  FIELDS_SIGNER,
  schemaCompany,
  schemaEquipment,
  schemaSigner,
  schemaNameTemplate,
} from '@/lib/catalogs/schemas'
import {
  success,
  falloBase,
  falloValidation,
  readFields,
  messageErrorBase,
  type StatusForm,
} from '@/lib/forms'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

function requireUuid(id: string) {
  if (!isUuid(id)) throw new Error('Identificador inválido')
}

export async function actualizarCompany(_previous: StatusForm, formData: FormData): Promise<StatusForm> {
  const user = await requireUser()
  const values = readFields(formData, FIELDS_COMPANY)
  if (user.rol !== 'admin') return { ok: false, message: 'Solo un administrador puede cambiar estos datos', errors: {}, values }
  const datos = schemaCompany.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('empresa_config').update(datos.data).eq('id', true)
  if (error) return falloBase(error, values)

  revalidatePath('/configuracion/empresa')
  return success('Datos de la empresa guardados')
}

export async function crearSigner(_previous: StatusForm, formData: FormData): Promise<StatusForm> {
  await requireUser()
  const values = readFields(formData, FIELDS_SIGNER)
  const datos = schemaSigner.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').insert(datos.data)
  if (error) return falloBase(error, values)

  revalidatePath('/configuracion/firmantes')
  return success('Firmante agregado')
}

export async function actualizarSigner(
  id: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(id)
  const values = readFields(formData, FIELDS_SIGNER)
  const datos = schemaSigner.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update(datos.data).eq('id', id)
  if (error) return falloBase(error, values)

  revalidatePath('/configuracion/firmantes')
  return success('Firmante guardado')
}

export async function changeStatusSigner(id: string, activo: boolean): Promise<void> {
  await requireUser()
  requireUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('firmantes').update({ activo }).eq('id', id)
  if (error) throw new Error(messageErrorBase(error))
  revalidatePath('/configuracion/firmantes')
}

export async function crearEquipment(_previous: StatusForm, formData: FormData): Promise<StatusForm> {
  await requireUser()
  const values = readFields(formData, FIELDS_EQUIPMENT)
  const datos = schemaEquipment.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').insert(datos.data)
  if (error) return falloBase(error, values)

  revalidatePath('/configuracion/equipos')
  return success('Equipo agregado')
}

export async function actualizarEquipment(
  id: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(id)
  const values = readFields(formData, FIELDS_EQUIPMENT)
  const datos = schemaEquipment.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update(datos.data).eq('id', id)
  if (error) return falloBase(error, values)

  revalidatePath('/configuracion/equipos')
  return success('Equipo guardado')
}

export async function changeStatusEquipment(id: string, activo: boolean): Promise<void> {
  await requireUser()
  requireUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('equipos').update({ activo }).eq('id', id)
  if (error) throw new Error(messageErrorBase(error))
  revalidatePath('/configuracion/equipos')
}

export async function renameTemplate(
  id: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(id)
  const values = readFields(formData, ['nombre'] as const)
  const datos = schemaNameTemplate.safeParse(values)
  if (!datos.success) return falloValidation(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update(datos.data).eq('id', id)
  if (error) return falloBase(error, values, { campo: 'nombre', message: 'Ya existe una plantilla con ese nombre' })

  revalidatePath('/configuracion/plantillas')
  revalidatePath(`/configuracion/plantillas/${id}`)
  return success('Plantilla renombrada')
}

export async function changeStatusTemplate(id: string, activa: boolean): Promise<void> {
  await requireUser()
  requireUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('plantillas').update({ activa }).eq('id', id)
  if (error) throw new Error(messageErrorBase(error))
  revalidatePath('/configuracion/plantillas')
}
