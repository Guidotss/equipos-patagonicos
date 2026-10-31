import type { Json } from '@/lib/supabase/database.types'
import type { PayloadSave } from '../editor/types'

import type { QuoteServiceClient as Client } from './contracts'
import { executeRpc, mapRpcError } from './rpc'

/**
 * Crea (sin id) o actualiza una cotización con todos sus ítems. Para actualizar hace falta la versión que se editó:
 * si otro guardó en el medio, la base lo rechaza con "La cotización cambió…" y no pisa nada.
 * Devuelve el número (se asigna al crear) y la versión nueva, que es la que la pantalla manda la próxima vez.
 */
export async function saveQuote(
  supabase: Client,
  payload: PayloadSave,
  id?: string,
  version?: string,
): Promise<{ id: string; numero: number; version: string }> {
  const { data: savedQuote, error } = await supabase.rpc('guardar_cotizacion_versionada', {
    p_datos: payload.p_datos as Json,
    p_items: payload.p_items as Json,
    p_id: id,
    p_updated_at: id ? version : undefined,
  })
  if (error) throw mapRpcError(error)

  const row = savedQuote[0]
  if (!row) throw new Error('El guardado no devolvió su versión')
  return row
}

/**
 * La cotización que esta reemplaza (renegociación), si es un presupuesto aprobado en curso: la pantalla ofrece
 * finalizarlo. La aprobación ya quedó registrada, así que si esta lectura falla no se ofrece nada (no es un error).
 */
export async function previousInProgress(
  supabase: Client,
  replacesA: string | null,
): Promise<{ id: string; numero: number } | null> {
  if (!replacesA) return null
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, numero, estado, presupuesto_estado')
    .eq('id', replacesA)
    .maybeSingle()
  if (error || !data) return null
  return data.estado === 'aprobada' && data.presupuesto_estado === 'en_curso'
    ? { id: data.id, numero: data.numero }
    : null
}

/** Desde borrador o enviada (de la app o cargada). */
export async function rejectQuote(supabase: Client, id: string): Promise<void> {
  await executeRpc(supabase.rpc('rechazar_cotizacion', { p_id: id }))
}

/** Una rechazada de la app vuelve a borrador; una cargada, a enviada. */
export async function reopenQuote(supabase: Client, id: string): Promise<void> {
  await executeRpc(supabase.rpc('reabrir_cotizacion', { p_id: id }))
}

/** Vuelve a enviada (si tuvo envíos o es cargada) o a borrador. No con documentos activos ni en un directo. */
export async function revertApproval(supabase: Client, id: string): Promise<void> {
  await executeRpc(supabase.rpc('revertir_aprobacion', { p_id: id }))
}

/** Un borrador que nunca se envió, o una cargada que no está aprobada. */
export async function removeQuote(supabase: Client, id: string): Promise<void> {
  await executeRpc(supabase.rpc('borrar_cotizacion', { p_id: id }))
}

/** Copia como borrador nuevo del mismo cliente (queda como renegociación: reemplaza_a). */
export async function duplicateQuote(supabase: Client, id: string, clientId?: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('duplicar_cotizacion', { p_id: id, p_cliente_id: clientId })
  if (error) throw mapRpcError(error)
  return { id: data }
}

/** Finaliza el presupuesto de una cotización aprobada (la anterior de una renegociación). */
export async function finishBudget(supabase: Client, id: string): Promise<void> {
  await executeRpc(supabase.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' }))
}
