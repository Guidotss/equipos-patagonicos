// src/lib/cotizaciones/servicio.ts
// Orquesta cotizaciones del lado del servidor. Recibe el cliente de Supabase por parámetro
// (el de la sesión del usuario), así respeta la RLS y se puede probar en integración.
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { todayArgentina } from '@/lib/format/dates'
import { readBlocks, type Format, type Unit } from '@/lib/templates/content'
import { VARIABLES } from '@/lib/templates/variables'
import { nameFileQuote } from '@/lib/pdf/file-name'
import { renderizarQuote } from '@/lib/pdf/render'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { DataDocument } from '@/lib/documents/schemas'
import type { FileSubido } from '@/lib/documents/service'
import { buildDocument, type DocumentQuote, type SourceDocument } from './document'
import {
  MESSAGE_CONFLICT,
  sourceFromEditor,
  type CatalogsEditor,
  type StatusEditor,
  type PayloadSave,
} from './editor'

type Client = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorQuote extends Error {}

/** Datos de la empresa que van en el PDF (membrete, pie y valores por defecto de las variables). */
async function readCompany(supabase: Client): Promise<SourceDocument['empresa']> {
  const { data, error } = await supabase
    .from('empresa_config')
    .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
    .single()
  if (error) throw error
  return data
}

/**
 * Lee la cotización con todo lo que necesita el PDF en una sola consulta: así `updated_at`
 * (la versión que se manda a las RPC) corresponde exactamente al contenido que se dibuja.
 */
async function cargarSource(supabase: Client, id: string) {
  const { data: row, error } = await supabase
    .from('cotizaciones')
    .select(
      `id, numero, fecha, formato, asunto, intro, validez_dias, mostrar_total, datos, bloques, estado, origen,
       updated_at, pdf_aprobado_path, archivo_original_path, reemplaza_a,
       cliente:clientes(razon_social, cuit),
       contacto:contactos(nombre, email),
       equipo:equipos(capacidad_tn, descripcion),
       firmante:firmantes(nombre, cargo, telefono),
       items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!row) return null

  const source: SourceDocument = {
    cotizacion: {
      numero: row.numero,
      fecha: row.fecha,
      formato: row.formato as Format,
      asunto: row.asunto,
      intro: row.intro,
      validez_dias: row.validez_dias,
      mostrar_total: row.mostrar_total,
      datos: row.datos,
      bloques: readBlocks(row.bloques),
    },
    items: row.items.map((item) => ({ ...item, unidad: item.unidad as Unit })),
    cliente: row.cliente,
    contacto: row.contacto,
    equipo: row.equipo,
    firmante: row.firmante,
    empresa: await readCompany(supabase),
  }
  return { fila: row, source }
}

async function cargarOFallar(supabase: Client, id: string) {
  const cargada = await cargarSource(supabase, id)
  if (!cargada) throw new ErrorQuote('La cotización no existe')
  return cargada
}

type Row = NonNullable<Awaited<ReturnType<typeof cargarSource>>>['fila']

const ABIERTAS = ['borrador', 'enviada']

// Lo que la base va a rechazar y ya se ve en la fila cargada se revisa antes de generar y subir el PDF,
// con los mismos mensajes: un PDF subido no se puede borrar desde la app y quedaría huérfano. La base
// sigue siendo la que decide (bloquea la fila y vuelve a validar todo); solo un cambio entre la lectura
// y la RPC puede dejar un archivo de más.

/**
 * La versión que vio la pantalla (el updated_at con el que se abrió o se guardó por última vez) tiene que ser la
 * de la fila que se va a dibujar: si no, se enviaría o aprobaría algo que el usuario no vio. Se compara al
 * milisegundo, como la base, porque la versión pasa por un Date de JS en el navegador. Sin versión (scripts y
 * tests), vale la que se acaba de leer.
 */
function requireVersion(row: Row, version: string | undefined) {
  if (version === undefined) return
  const view = Date.parse(version)
  // El mismo texto que da la base (private.exigir_version): así el editor lo reconoce y ofrece "Recargar".
  if (Number.isNaN(view) || view !== Date.parse(row.updated_at)) throw new ErrorQuote(MESSAGE_CONFLICT)
}

function requirePrices(row: Row) {
  if (!row.items.length) throw new ErrorQuote('La cotización no tiene ítems')
  if (row.items.some((item) => item.precio_unitario === null)) throw new ErrorQuote('Hay ítems sin precio')
}

function requireEnviable(row: Row) {
  if (!ABIERTAS.includes(row.estado)) {
    throw new ErrorQuote('Solo se puede enviar una cotización en borrador o ya enviada')
  }
  if (row.origen !== 'app') {
    throw new ErrorQuote('Una cotización cargada no se envía desde la app: su documento es el PDF original')
  }
  requirePrices(row)
}

function requireAprobable(row: Row, fecha: string) {
  if (!ABIERTAS.includes(row.estado)) throw new ErrorQuote('Solo se puede aprobar una cotización en borrador o enviada')
  if (!z.iso.date().safeParse(fecha).success) throw new ErrorQuote('La fecha de aprobación no es válida')
  if (fecha < row.fecha) throw new ErrorQuote('La fecha de aprobación no puede ser anterior a la cotización')
  if (row.origen !== 'importada') requirePrices(row)
}

/** Arma el documento y exige que no queden variables sin completar ni mal escritas (informa todas juntas). */
function documentComplete(source: SourceDocument): DocumentQuote {
  const document = buildDocument(source)
  const problemas: string[] = []
  if (document.faltantes.length) {
    problemas.push(`Faltan completar: ${document.faltantes.map((nombre) => VARIABLES[nombre]).join(', ')}`)
  }
  if (document.desconocidas.length) {
    problemas.push(`Hay variables mal escritas: ${document.desconocidas.map((nombre) => `{{${nombre}}}`).join(', ')}`)
  }
  if (problemas.length) throw new ErrorQuote(problemas.join('. '))
  return document
}

async function uploadPdf(supabase: Client, path: string, pdf: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
}

type ErrorRpc = { code?: string; message: string }

/** Los errores de negocio de la base (P0001) llegan como ErrorCotizacion; el resto, tal cual. */
function errorOfRpc(error: ErrorRpc) {
  return error.code === 'P0001' ? new ErrorQuote(error.message) : error
}

/** Ejecuta una RPC que no devuelve nada y tira su error (ver errorDeRpc). */
async function llamar(rpc: PromiseLike<{ error: ErrorRpc | null }>): Promise<void> {
  const { error } = await rpc
  if (error) throw errorOfRpc(error)
}

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
  const { data: guardada, error } = await supabase.rpc('guardar_cotizacion_versionada', {
    p_datos: payload.p_datos as Json,
    p_items: payload.p_items as Json,
    p_id: id,
    p_updated_at: id ? version : undefined,
  })
  if (error) throw errorOfRpc(error)

  const row = guardada[0]
  if (!row) throw new Error('El guardado no devolvió su versión')
  return row
}

/** El snapshot se sube antes; la aprobación y el alta de la OC se confirman juntas o se revierten juntas. */
export async function approveWithOrderCompra(
  supabase: Client, id: string, version: string, datos: DataDocument, archivos: FileSubido[],
): Promise<string> {
  const { fila: row, source } = await cargarOFallar(supabase, id)
  requireVersion(row, version)
  requireAprobable(row, datos.fecha ?? todayArgentina())
  if (datos.tipo !== 'orden_compra') throw new ErrorQuote('Elegí una orden de compra')
  let path: string | undefined
  if (row.origen === 'app') {
    path = `cotizaciones/${id}/aprobada-${crypto.randomUUID()}.pdf`
    await uploadPdf(supabase, path, await renderizarQuote(documentComplete(source)))
  }
  const { data, error } = await supabase.rpc('aprobar_con_orden_compra', {
    p_id: id, p_updated_at: version, p_pdf_path: path ?? '', p_documento: datos, p_archivos: archivos,
  })
  if (error) throw errorOfRpc(error)
  return data
}

/**
 * Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada. Devuelve el id del envío,
 * para descargar exactamente ese PDF (/cotizaciones/{id}/pdf?envio={envioId}&descargar=1).
 */
export async function sendQuote(supabase: Client, id: string, version?: string): Promise<{ envioId: string }> {
  const { fila: row, source } = await cargarOFallar(supabase, id)
  requireVersion(row, version)
  requireEnviable(row)

  const pdf = await renderizarQuote(documentComplete(source))
  const path = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await uploadPdf(supabase, path, pdf)
  await llamar(supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: row.updated_at, p_pdf_path: path }))

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
 * La cotización que esta reemplaza (renegociación), si es un presupuesto aprobado en curso: la pantalla ofrece
 * finalizarlo. La aprobación ya quedó registrada, así que si esta lectura falla no se ofrece nada (no es un error).
 */
async function previousInCurso(
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
  return data.estado === 'aprobada' && data.presupuesto_estado === 'en_curso' ? { id: data.id, numero: data.numero } : null
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
  const { fila: row, source } = await cargarOFallar(supabase, id)
  requireVersion(row, version)
  const dateApproval = fecha ?? todayArgentina()
  requireAprobable(row, dateApproval)

  let path: string | undefined
  if (row.origen !== 'importada') {
    const pdf = await renderizarQuote(documentComplete(source))
    path = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
    await uploadPdf(supabase, path, pdf)
  }
  await llamar(
    supabase.rpc('aprobar_cotizacion', {
      p_id: id,
      p_updated_at: row.updated_at,
      p_pdf_path: path,
      p_fecha: dateApproval,
    }),
  )
  return { anterior: await previousInCurso(supabase, row.reemplaza_a) }
}

/** Desde borrador o enviada (de la app o cargada). */
export async function rejectQuote(supabase: Client, id: string): Promise<void> {
  await llamar(supabase.rpc('rechazar_cotizacion', { p_id: id }))
}

/** Una rechazada de la app vuelve a borrador; una cargada, a enviada. */
export async function reopenQuote(supabase: Client, id: string): Promise<void> {
  await llamar(supabase.rpc('reabrir_cotizacion', { p_id: id }))
}

/** Vuelve a enviada (si tuvo envíos o es cargada) o a borrador. No con documentos activos ni en un directo. */
export async function revertApproval(supabase: Client, id: string): Promise<void> {
  await llamar(supabase.rpc('revertir_aprobacion', { p_id: id }))
}

/** Un borrador que nunca se envió, o una cargada que no está aprobada. */
export async function removeQuote(supabase: Client, id: string): Promise<void> {
  await llamar(supabase.rpc('borrar_cotizacion', { p_id: id }))
}

/** Copia como borrador nuevo del mismo cliente (queda como renegociación: reemplaza_a). */
export async function duplicateQuote(supabase: Client, id: string, clientId?: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('duplicar_cotizacion', { p_id: id, p_cliente_id: clientId })
  if (error) throw errorOfRpc(error)
  return { id: data }
}

/** Finaliza el presupuesto de una cotización aprobada (la anterior de una renegociación). */
export async function finishBudget(supabase: Client, id: string): Promise<void> {
  await llamar(supabase.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' }))
}

export type EntryViewPreview = { estado: StatusEditor }

async function readClient(supabase: Client, id: string) {
  const { data, error } = await supabase.from('clientes').select('id, razon_social, cuit').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** El contacto solo si es de ese cliente (como exige la base al guardar). */
async function readContact(supabase: Client, clientId: string, id: string) {
  const { data, error } = await supabase
    .from('contactos')
    .select('nombre, email')
    .eq('id', id)
    .eq('cliente_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function readEquipment(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, descripcion, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function readSigner(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * El PDF de lo que está en el editor, sin guardar, con los mismos componentes que el definitivo y las variables
 * sin completar en amarillo. Del navegador se toman los textos, los ítems y los ids: el cliente, el contacto, el
 * equipo, el firmante y la empresa se releen de la base (un id que no existe, o un contacto de otro cliente,
 * queda vacío).
 */
export async function viewPreview(supabase: Client, { estado }: EntryViewPreview): Promise<Buffer> {
  const clientId = estado.cliente?.id
  const [cliente, contacto, equipo, firmante, company] = await Promise.all([
    clientId ? readClient(supabase, clientId) : null,
    clientId && estado.contactoId ? readContact(supabase, clientId, estado.contactoId) : null,
    estado.equipoId ? readEquipment(supabase, estado.equipoId) : null,
    estado.firmanteId ? readSigner(supabase, estado.firmanteId) : null,
    readCompany(supabase),
  ])
  const catalogs: CatalogsEditor = {
    plantillas: [],
    equipos: equipo ? [equipo] : [],
    firmantes: firmante ? [firmante] : [],
    empresa: company,
  }
  // fuenteDesdeEditor toma equipo y firmante de los catálogos por id, y usa hoy si la fecha está a medio escribir.
  const releido: StatusEditor = { ...estado, cliente }
  const document = buildDocument(sourceFromEditor(releido, catalogs, contacto))
  return renderizarQuote(document, { highlightVariables: true })
}

async function descargar(supabase: Client, path: string): Promise<Buffer> {
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
  const cargada = await cargarSource(supabase, id)
  if (!cargada) return null
  const { fila: row, source } = cargada
  const nameFile = nameFileQuote(row.numero, source.cliente.razon_social)

  if (sendId) {
    const { data: envio, error } = await supabase
      .from('cotizacion_envios')
      .select('pdf_path')
      .eq('id', sendId)
      .eq('cotizacion_id', id)
      .maybeSingle()
    if (error) throw error
    if (!envio) return null
    return { pdf: await descargar(supabase, envio.pdf_path), nameFile }
  }

  // Un presupuesto directo no tiene PDF: generarlo mostraría una cotización que nunca existió.
  if (row.origen === 'directa') return null

  const actual = options.actual === true && row.origen === 'app' && row.estado !== 'aprobada'
  const saved = actual
    ? null
    : (row.pdf_aprobado_path ??
      row.archivo_original_path ??
      (WITH_SEND.includes(row.estado) ? await pathLastSend(supabase, id) : null))
  if (saved) return { pdf: await descargar(supabase, saved), nameFile }

  return { pdf: await renderizarQuote(buildDocument(source), { highlightVariables: actual }), nameFile }
}
