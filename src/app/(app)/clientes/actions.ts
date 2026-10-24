'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUsuario } from '@/lib/auth'
import { CAMPOS_CLIENTE, CAMPOS_CONTACTO, esquemaCliente, esquemaContacto } from '@/lib/clientes/esquemas'
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

const CUIT_REPETIDO = { campo: 'cuit', mensaje: 'Ya existe un cliente con ese CUIT' }

function exigirUuid(...ids: string[]) {
  if (!ids.every(esUuid)) throw new Error('Identificador inválido')
}

export async function crearCliente(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await requireUsuario()
  const valores = leerCampos(formData, CAMPOS_CLIENTE)
  const datos = esquemaCliente.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').insert(datos.data).select('id').single()
  if (error) return falloBase(error, valores, CUIT_REPETIDO)

  revalidatePath('/clientes')
  redirect(`/clientes/${data.id}`)
}

export async function actualizarCliente(
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(id)
  const valores = leerCampos(formData, CAMPOS_CLIENTE)
  const datos = esquemaCliente.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update(datos.data).eq('id', id)
  if (error) return falloBase(error, valores, CUIT_REPETIDO)

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return exito('Cliente guardado')
}

export async function cambiarEstadoCliente(id: string, activo: boolean): Promise<void> {
  await requireUsuario()
  exigirUuid(id)
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
}

export async function crearContacto(
  clienteId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(clienteId)
  const valores = leerCampos(formData, CAMPOS_CONTACTO)
  const datos = esquemaContacto.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase.from('contactos').insert({ ...datos.data, cliente_id: clienteId })
  if (error) return falloBase(error, valores)

  revalidatePath(`/clientes/${clienteId}`)
  return exito('Contacto agregado')
}

export async function actualizarContacto(
  clienteId: string,
  contactoId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requireUsuario()
  exigirUuid(clienteId, contactoId)
  const valores = leerCampos(formData, CAMPOS_CONTACTO)
  const datos = esquemaContacto.safeParse(valores)
  if (!datos.success) return falloValidacion(datos.error, valores)

  const supabase = await createClient()
  const { error } = await supabase
    .from('contactos')
    .update(datos.data)
    .eq('id', contactoId)
    .eq('cliente_id', clienteId)
  if (error) return falloBase(error, valores)

  revalidatePath(`/clientes/${clienteId}`)
  return exito('Contacto guardado')
}

export async function borrarContacto(clienteId: string, contactoId: string): Promise<void> {
  await requireUsuario()
  exigirUuid(clienteId, contactoId)
  const supabase = await createClient()
  const { error } = await supabase.from('contactos').delete().eq('id', contactoId).eq('cliente_id', clienteId)
  if (error) throw new Error(mensajeErrorBase(error))
  revalidatePath(`/clientes/${clienteId}`)
}
