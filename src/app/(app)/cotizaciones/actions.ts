'use server'
// src/app/(app)/cotizaciones/actions.ts
// Acciones de la lista y del editor de cotizaciones. No reciben FormData: el editor manda su estado completo y
// los botones, ids. Nunca tiran (salvo el redirect de requireUsuario): devuelven un Resultado con el mensaje para
// mostrar, así "Hay ítems sin precio" o "La cotización cambió…" llegan a la pantalla y no al boundary de error.

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { schemaStatusEditor, payloadSave, type StatusEditor } from '@/lib/quotes/editor'
import * as service from '@/lib/quotes/service'
import { messageForUser, type Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'
import { isUuid, textRequired } from '@/lib/validation'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Fallo = { ok: false; message: string; errors?: Record<string, string> }

const IDENTIFICADOR_INVALID = 'Identificador inválido'

function fallo(message: string, errors?: Record<string, string>): Fallo {
  return errors ? { ok: false, message, errors } : { ok: false, message }
}

/** Corre la operación con la sesión del usuario y convierte cualquier error en un mensaje para mostrar. */
async function run<T>(operacion: (supabase: Supabase) => Promise<T>, message?: string): Promise<Result<T>> {
  try {
    const datos = await operacion(await createClient())
    return message ? { ok: true, datos, message } : { ok: true, datos }
  } catch (error) {
    unstable_rethrow(error)
    return fallo(messageForUser(error))
  }
}

function revalidar(...ids: string[]) {
  revalidatePath('/cotizaciones')
  for (const id of ids) revalidatePath(`/cotizaciones/${id}`)
}

/**
 * Guarda el estado del editor: crea la cotización (sin id) o la actualiza con la versión que se editó.
 * Los errores de cada campo vuelven en `errores` con la clave de payloadGuardar ('cliente', 'items.2.precio'…).
 */
export async function saveQuote(
  estado: StatusEditor,
): Promise<Result<{ id: string; numero: number; version: string }>> {
  await requireUser()
  const leido = schemaStatusEditor.safeParse(estado)
  if (!leido.success) return fallo('Los datos de la cotización no son válidos. Recargá la página y probá de nuevo.')
  const armado = payloadSave(leido.data)
  if (!armado.ok) return fallo('Revisá los datos marcados', armado.errors)

  const { id, version } = leido.data
  const result = await run(
    (supabase) => service.saveQuote(supabase, armado.payload, id ?? undefined, version ?? undefined),
    'Cotización guardada',
  )
  if (result.ok) revalidar(result.datos.id)
  return result
}

/** Genera el PDF, lo registra como enviado y devuelve el envío para descargarlo. */
export async function sendQuote(id: string, version: string): Promise<Result<{ envioId: string }>> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  const result = await run(
    (supabase) => service.sendQuote(supabase, id, version),
    'Cotización marcada como enviada',
  )
  if (result.ok) revalidar(id)
  return result
}

/** Aprueba con la fecha elegida. Si reemplaza a un presupuesto en curso, lo devuelve para ofrecer finalizarlo. */
export async function approveQuote(
  id: string,
  version: string,
  fecha: string,
): Promise<Result<{ anterior: { id: string; numero: number } | null }>> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  if (typeof fecha !== 'string') return fallo('La fecha de aprobación no es válida')
  const result = await run(
    (supabase) => service.approveQuote(supabase, id, fecha, version),
    'Cotización aprobada',
  )
  if (result.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return result
}

/** Finaliza el presupuesto de la cotización anterior de una renegociación. */
export async function finishBudget(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  const result = await run(async (supabase) => {
    await service.finishBudget(supabase, id)
    return null
  }, 'Presupuesto finalizado')
  if (result.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return result
}

export async function rejectQuote(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  const result = await run(async (supabase) => {
    await service.rejectQuote(supabase, id)
    return null
  }, 'Cotización rechazada')
  if (result.ok) revalidar(id)
  return result
}

export async function reopenQuote(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  const result = await run(async (supabase) => {
    await service.reopenQuote(supabase, id)
    return null
  }, 'Cotización reabierta')
  if (result.ok) revalidar(id)
  return result
}

export async function revertApproval(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  const result = await run(async (supabase) => {
    await service.revertApproval(supabase, id)
    return null
  }, 'Aprobación revertida')
  if (result.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return result
}

export async function removeQuote(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  const result = await run(async (supabase) => {
    await service.removeQuote(supabase, id)
    return null
  }, 'Cotización borrada')
  if (result.ok) revalidar(id)
  return result
}

/** Copia como borrador nuevo (renegociación del mismo cliente) y devuelve su id para abrirla. */
export async function duplicateQuote(id: string, clientId?: string): Promise<Result<{ id: string }>> {
  await requireUser()
  if (!isUuid(id)) return fallo(IDENTIFICADOR_INVALID)
  if (clientId !== undefined && !isUuid(clientId)) return fallo('Cliente inválido')
  const result = await run((supabase) => service.duplicateQuote(supabase, id, clientId), 'Cotización duplicada')
  if (result.ok) revalidar(id, result.datos.id)
  return result
}

/** Para el combobox de cliente: sin acentos, por razón social, CUIT o contacto; los inactivos al final. */
export async function searchClients(
  texto: string,
): Promise<Result<{ id: string; razon_social: string; cuit: string | null; activo: boolean }[]>> {
  await requireUser()
  if (typeof texto !== 'string') return fallo('Búsqueda inválida')
  return run(async (supabase) => {
    const { data, error } = await supabase
      .rpc('buscar_clientes', { texto: texto.slice(0, 200), limite: 20 })
      .select('id, razon_social, cuit, activo')
    if (error) throw error
    return data
  })
}

const schemaRazonSocial = textRequired('Ingresá la razón social')

/** Alta rápida desde el combobox: solo la razón social (el resto se completa después en Clientes). */
export async function crearClientRapido(
  razonSocial: string,
): Promise<Result<{ id: string; razon_social: string; cuit: string | null }>> {
  await requireUser()
  const leido = schemaRazonSocial.safeParse(razonSocial)
  if (!leido.success) return fallo(leido.error.issues[0].message)
  const result = await run(async (supabase) => {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ razon_social: leido.data })
      .select('id, razon_social, cuit')
      .single()
    if (error) throw error
    return data
  }, 'Cliente creado')
  if (result.ok) revalidatePath('/clientes')
  return result
}

/** Contactos del cliente (por nombre) y el último que se usó en sus cotizaciones, para preseleccionarlo. */
export async function contactsOfClient(
  clientId: string,
): Promise<Result<{ contactos: { id: string; nombre: string; email: string }[]; lastContactId: string | null }>> {
  await requireUser()
  if (!isUuid(clientId)) return fallo(IDENTIFICADOR_INVALID)
  return run(async (supabase) => {
    const [contactos, last] = await Promise.all([
      supabase.from('contactos').select('id, nombre, email').eq('cliente_id', clientId).order('nombre'),
      supabase
        .from('cotizaciones')
        .select('contacto_id')
        .eq('cliente_id', clientId)
        .not('contacto_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (contactos.error) throw contactos.error
    if (last.error) throw last.error
    return { contactos: contactos.data, lastContactId: last.data?.contacto_id ?? null }
  })
}
