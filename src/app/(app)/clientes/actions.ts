'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { FIELDS_CLIENT, FIELDS_CONTACT, schemaClient, schemaContact } from '@/lib/clients/schemas'
import {
  success,
  databaseFailure,
  validationFailure,
  readFields,
  databaseErrorMessage,
  type StatusForm,
} from '@/lib/forms'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

const CUIT_REPETIDO = { campo: 'cuit', message: 'Ya existe un cliente con ese CUIT' }

function requireUuid(...ids: string[]) {
  if (!ids.every(isUuid)) throw new Error('Identificador inválido')
}

export async function crearClient(_previous: StatusForm, formData: FormData): Promise<StatusForm> {
  await requireUser()
  const values = readFields(formData, FIELDS_CLIENT)
  const datos = schemaClient.safeParse(values)
  if (!datos.success) return validationFailure(datos.error, values)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').insert(datos.data).select('id').single()
  if (error) return databaseFailure(error, values, CUIT_REPETIDO)

  revalidatePath('/clientes')
  redirect(`/clientes/${data.id}`)
}

export async function actualizarClient(
  id: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(id)
  const values = readFields(formData, FIELDS_CLIENT)
  const datos = schemaClient.safeParse(values)
  if (!datos.success) return validationFailure(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update(datos.data).eq('id', id)
  if (error) return databaseFailure(error, values, CUIT_REPETIDO)

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return success('Cliente guardado')
}

export async function changeStatusClient(id: string, activo: boolean): Promise<void> {
  await requireUser()
  requireUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id)
  if (error) throw new Error(databaseErrorMessage(error))
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
}

export async function crearContact(
  clientId: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(clientId)
  const values = readFields(formData, FIELDS_CONTACT)
  const datos = schemaContact.safeParse(values)
  if (!datos.success) return validationFailure(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase.from('contactos').insert({ ...datos.data, cliente_id: clientId })
  if (error) return databaseFailure(error, values)

  revalidatePath(`/clientes/${clientId}`)
  return success('Contacto agregado')
}

export async function actualizarContact(
  clientId: string,
  contactId: string,
  _previous: StatusForm,
  formData: FormData,
): Promise<StatusForm> {
  await requireUser()
  requireUuid(clientId, contactId)
  const values = readFields(formData, FIELDS_CONTACT)
  const datos = schemaContact.safeParse(values)
  if (!datos.success) return validationFailure(datos.error, values)

  const supabase = await createClient()
  const { error } = await supabase
    .from('contactos')
    .update(datos.data)
    .eq('id', contactId)
    .eq('cliente_id', clientId)
  if (error) return databaseFailure(error, values)

  revalidatePath(`/clientes/${clientId}`)
  return success('Contacto guardado')
}

export async function removeContact(clientId: string, contactId: string): Promise<void> {
  await requireUser()
  requireUuid(clientId, contactId)
  const supabase = await createClient()
  const { error } = await supabase.from('contactos').delete().eq('id', contactId).eq('cliente_id', clientId)
  if (error) throw new Error(databaseErrorMessage(error))
  revalidatePath(`/clientes/${clientId}`)
}
