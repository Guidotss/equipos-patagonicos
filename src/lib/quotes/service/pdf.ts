import { nameFileQuote } from '@/lib/pdf/file-name'
import { renderQuote } from '@/lib/pdf/render'
import { VARIABLES } from '@/lib/templates/variables'
import { buildDocument, type DocumentQuote, type SourceDocument } from '../document'
import { sourceFromEditor } from '../editor/document'
import type { CatalogsEditor, StatusEditor } from '../editor/types'

import type { QuoteServiceClient as Client } from './contracts'
import { ErrorQuote } from './contracts'
import { loadQuoteSource, readClient, readCompany, readContact, readEquipment, readSigner } from './source'

const BUCKET = 'documentos'

/** Arma el documento y exige que no queden variables sin completar ni mal escritas (informa todas juntas). */
export function documentComplete(source: SourceDocument): DocumentQuote {
  const document = buildDocument(source)
  const issues: string[] = []
  if (document.faltantes.length) {
    issues.push(`Faltan completar: ${document.faltantes.map((name) => VARIABLES[name]).join(', ')}`)
  }
  if (document.desconocidas.length) {
    issues.push(`Hay variables mal escritas: ${document.desconocidas.map((name) => `{{${name}}}`).join(', ')}`)
  }
  if (issues.length) throw new ErrorQuote(issues.join('. '))
  return document
}

export async function uploadPdf(supabase: Client, path: string, pdf: Buffer) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
}

export type EntryViewPreview = { estado: StatusEditor }

/**
 * El PDF de lo que está en el editor, sin guardar, con los mismos componentes que el definitivo y las variables
 * sin completar en amarillo. Del navegador se toman los textos, los ítems y los ids: el cliente, el contacto, el
 * equipo, el firmante y la empresa se releen de la base (un id que no existe, o un contacto de otro cliente,
 * queda vacío).
 */
export async function viewPreview(supabase: Client, { estado: state }: EntryViewPreview): Promise<Buffer> {
  const clientId = state.cliente?.id
  const [client, contact, equipment, signer, company] = await Promise.all([
    clientId ? readClient(supabase, clientId) : null,
    clientId && state.contactoId ? readContact(supabase, clientId, state.contactoId) : null,
    state.equipoId ? readEquipment(supabase, state.equipoId) : null,
    state.firmanteId ? readSigner(supabase, state.firmanteId) : null,
    readCompany(supabase),
  ])
  const catalogs: CatalogsEditor = {
    plantillas: [],
    equipos: equipment ? [equipment] : [],
    firmantes: signer ? [signer] : [],
    empresa: company,
  }
  // sourceFromEditor toma equipo y firmante de los catálogos por id, y usa hoy si la fecha está a medio escribir.
  const reloadedState: StatusEditor = { ...state, cliente: client }
  const document = buildDocument(sourceFromEditor(reloadedState, catalogs, contact))
  return renderQuote(document, { highlightVariables: true })
}

async function downloadPdf(supabase: Client, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/** La ruta del PDF del último envío de la cotización, o null si nunca se envió. */
async function pathLastSend(supabase: Client, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('cotizacion_envios')
    .select('pdf_path')
    .eq('cotizacion_id', id)
    .order('enviada_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.pdf_path ?? null
}

/** Estados en los que se muestra el último envío: lo que recibió el cliente, no lo editado después. */
const WITH_SEND = ['enviada', 'rechazada']

/**
 * El PDF que corresponde mostrar: el de un envío puntual, el congelado de una aprobada,
 * el original de una cotización cargada, el último envío de una enviada (o rechazada después de
 * enviarse) o uno generado en el momento (borradores y lo que nunca se envió).
 * Una enviada se puede seguir editando sin cambiar de estado: generarla en el momento mostraría
 * algo que el cliente no recibió. Un presupuesto directo no tiene PDF (null, igual que una inexistente).
 * Con `actual` (la vista previa en el celular), una de la app que no está aprobada se genera en el momento con lo
 * guardado, aunque se haya enviado, y con las variables sin completar en amarillo.
 */
export async function pdfForShow(
  supabase: Client,
  id: string,
  sendId?: string,
  options: { actual?: boolean } = {},
): Promise<{ pdf: Buffer; nameFile: string } | null> {
  const loadedQuote = await loadQuoteSource(supabase, id)
  if (!loadedQuote) return null
  const { fila: row, source } = loadedQuote
  const nameFile = nameFileQuote(row.numero, source.cliente.razon_social)

  if (sendId) {
    const { data: delivery, error } = await supabase
      .from('cotizacion_envios')
      .select('pdf_path')
      .eq('id', sendId)
      .eq('cotizacion_id', id)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return null
    return { pdf: await downloadPdf(supabase, delivery.pdf_path), nameFile }
  }

  // Un presupuesto directo no tiene PDF: generarlo mostraría una cotización que nunca existió.
  if (row.origen === 'directa') return null

  const current = options.actual === true && row.origen === 'app' && row.estado !== 'aprobada'
  const saved = current
    ? null
    : (row.pdf_aprobado_path ??
      row.archivo_original_path ??
      (WITH_SEND.includes(row.estado) ? await pathLastSend(supabase, id) : null))
  if (saved) return { pdf: await downloadPdf(supabase, saved), nameFile }

  return { pdf: await renderQuote(buildDocument(source), { highlightVariables: current }), nameFile }
}
