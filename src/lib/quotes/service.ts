// Server-side quote lifecycle orchestration. All operations receive the session's Supabase client.
// No server-only marker: the integration suite imports this module directly.
import type { DataDocument } from '@/lib/documents/schemas'
import type { FileSubido } from '@/lib/documents/service'
import { todayArgentina } from '@/lib/format/dates'
import { renderizarQuote } from '@/lib/pdf/render'

import { ErrorQuote, type QuoteServiceClient as Client } from './service/contracts'
import { documentComplete, uploadPdf } from './service/pdf'
import { previousInProgress } from './service/persistence'
import { executeRpc, mapRpcError } from './service/rpc'
import { requireApprovable, requireSendable, requireVersion } from './service/rules'
import { requireQuoteSource } from './service/source'
export { ErrorQuote } from './service/contracts'
export { pdfForShow, viewPreview, type EntryViewPreview } from './service/pdf'
export {
  duplicateQuote,
  finishBudget,
  rejectQuote,
  removeQuote,
  reopenQuote,
  revertApproval,
  saveQuote,
} from './service/persistence'

/** El snapshot se sube antes; la aprobación y el alta de la OC se confirman juntas o se revierten juntas. */
export async function approveWithOrderCompra(
  supabase: Client,
  id: string,
  version: string,
  datos: DataDocument,
  archivos: FileSubido[],
): Promise<string> {
  const { fila: row, source } = await requireQuoteSource(supabase, id)
  requireVersion(row, version)
  requireApprovable(row, datos.fecha ?? todayArgentina())
  if (datos.tipo !== 'orden_compra') throw new ErrorQuote('Elegí una orden de compra')
  let path: string | undefined
  if (row.origen === 'app') {
    path = `cotizaciones/${id}/aprobada-${crypto.randomUUID()}.pdf`
    await uploadPdf(supabase, path, await renderizarQuote(documentComplete(source)))
  }
  const { data, error } = await supabase.rpc('aprobar_con_orden_compra', {
    p_id: id,
    p_updated_at: version,
    p_pdf_path: path ?? '',
    p_documento: datos,
    p_archivos: archivos,
  })
  if (error) throw mapRpcError(error)
  return data
}

/**
 * Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada. Devuelve el id del envío,
 * para descargar exactamente ese PDF (/cotizaciones/{id}/pdf?envio={envioId}&descargar=1).
 */
export async function sendQuote(supabase: Client, id: string, version?: string): Promise<{ envioId: string }> {
  const { fila: row, source } = await requireQuoteSource(supabase, id)
  requireVersion(row, version)
  requireSendable(row)

  const pdf = await renderizarQuote(documentComplete(source))
  const path = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await uploadPdf(supabase, path, pdf)
  await executeRpc(supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: row.updated_at, p_pdf_path: path }))

  // La ruta lleva la hora en milisegundos y no se pisa: identifica el envío que se acaba de registrar.
  const { data: envio, error } = await supabase
    .from('cotizacion_envios')
    .select('id')
    .eq('cotizacion_id', id)
    .eq('pdf_path', path)
    .single()
  if (error) throw error
  return { envioId: envio.id }
}

/**
 * Aprueba (la cotización queda congelada). Si se armó en la app, genera y guarda el PDF definitivo;
 * si es una cotización cargada, se aprueba con su PDF original y no se genera nada.
 * Sin fecha, se aprueba con la de hoy en Argentina (como haría la base), ya validada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada.
 * Devuelve la cotización anterior si esta la reemplaza y su presupuesto sigue en curso.
 */
export async function approveQuote(
  supabase: Client,
  id: string,
  fecha?: string,
  version?: string,
): Promise<{ anterior: { id: string; numero: number } | null }> {
  const { fila: row, source } = await requireQuoteSource(supabase, id)
  requireVersion(row, version)
  const dateApproval = fecha ?? todayArgentina()
  requireApprovable(row, dateApproval)

  let path: string | undefined
  if (row.origen !== 'importada') {
    const pdf = await renderizarQuote(documentComplete(source))
    path = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
    await uploadPdf(supabase, path, pdf)
  }
  await executeRpc(
    supabase.rpc('aprobar_cotizacion', {
      p_id: id,
      p_updated_at: row.updated_at,
      p_pdf_path: path,
      p_fecha: dateApproval,
    }),
  )
  return { anterior: await previousInProgress(supabase, row.reemplaza_a) }
}
