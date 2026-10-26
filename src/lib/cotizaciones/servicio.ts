// src/lib/cotizaciones/servicio.ts
// Orquesta cotizaciones del lado del servidor. Recibe el cliente de Supabase por parámetro
// (el de la sesión del usuario), así respeta la RLS y se puede probar en integración.
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { hoyArgentina } from '@/lib/format/fechas'
import { leerBloques, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { nombreArchivoCotizacion } from '@/lib/pdf/nombre-archivo'
import { renderizarCotizacion } from '@/lib/pdf/render'
import type { Database, Json } from '@/lib/supabase/database.types'
import { armarDocumento, type DocumentoCotizacion, type FuenteDocumento } from './documento'
import {
  MENSAJE_CONFLICTO,
  fuenteDesdeEditor,
  type CatalogosEditor,
  type EstadoEditor,
  type PayloadGuardar,
} from './editor'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorCotizacion extends Error {}

/** Datos de la empresa que van en el PDF (membrete, pie y valores por defecto de las variables). */
async function leerEmpresa(supabase: Cliente): Promise<FuenteDocumento['empresa']> {
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
async function cargarFuente(supabase: Cliente, id: string) {
  const { data: fila, error } = await supabase
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
  if (!fila) return null

  const fuente: FuenteDocumento = {
    cotizacion: {
      numero: fila.numero,
      fecha: fila.fecha,
      formato: fila.formato as Formato,
      asunto: fila.asunto,
      intro: fila.intro,
      validez_dias: fila.validez_dias,
      mostrar_total: fila.mostrar_total,
      datos: fila.datos,
      bloques: leerBloques(fila.bloques),
    },
    items: fila.items.map((item) => ({ ...item, unidad: item.unidad as Unidad })),
    cliente: fila.cliente,
    contacto: fila.contacto,
    equipo: fila.equipo,
    firmante: fila.firmante,
    empresa: await leerEmpresa(supabase),
  }
  return { fila, fuente }
}

async function cargarOFallar(supabase: Cliente, id: string) {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) throw new ErrorCotizacion('La cotización no existe')
  return cargada
}

type Fila = NonNullable<Awaited<ReturnType<typeof cargarFuente>>>['fila']

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
function exigirVersion(fila: Fila, version: string | undefined) {
  if (version === undefined) return
  const vista = Date.parse(version)
  // El mismo texto que da la base (private.exigir_version): así el editor lo reconoce y ofrece "Recargar".
  if (Number.isNaN(vista) || vista !== Date.parse(fila.updated_at)) throw new ErrorCotizacion(MENSAJE_CONFLICTO)
}

function exigirPrecios(fila: Fila) {
  if (!fila.items.length) throw new ErrorCotizacion('La cotización no tiene ítems')
  if (fila.items.some((item) => item.precio_unitario === null)) throw new ErrorCotizacion('Hay ítems sin precio')
}

function exigirEnviable(fila: Fila) {
  if (!ABIERTAS.includes(fila.estado)) {
    throw new ErrorCotizacion('Solo se puede enviar una cotización en borrador o ya enviada')
  }
  if (fila.origen !== 'app') {
    throw new ErrorCotizacion('Una cotización cargada no se envía desde la app: su documento es el PDF original')
  }
  exigirPrecios(fila)
}

function exigirAprobable(fila: Fila, fecha: string) {
  if (!ABIERTAS.includes(fila.estado)) throw new ErrorCotizacion('Solo se puede aprobar una cotización en borrador o enviada')
  if (!z.iso.date().safeParse(fecha).success) throw new ErrorCotizacion('La fecha de aprobación no es válida')
  if (fecha < fila.fecha) throw new ErrorCotizacion('La fecha de aprobación no puede ser anterior a la cotización')
  if (fila.origen !== 'importada') exigirPrecios(fila)
}

/** Arma el documento y exige que no queden variables sin completar ni mal escritas (informa todas juntas). */
function documentoCompleto(fuente: FuenteDocumento): DocumentoCotizacion {
  const documento = armarDocumento(fuente)
  const problemas: string[] = []
  if (documento.faltantes.length) {
    problemas.push(`Faltan completar: ${documento.faltantes.map((nombre) => VARIABLES[nombre]).join(', ')}`)
  }
  if (documento.desconocidas.length) {
    problemas.push(`Hay variables mal escritas: ${documento.desconocidas.map((nombre) => `{{${nombre}}}`).join(', ')}`)
  }
  if (problemas.length) throw new ErrorCotizacion(problemas.join('. '))
  return documento
}

async function subirPdf(supabase: Cliente, ruta: string, pdf: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, pdf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
}

type ErrorRpc = { code?: string; message: string }

/** Los errores de negocio de la base (P0001) llegan como ErrorCotizacion; el resto, tal cual. */
function errorDeRpc(error: ErrorRpc) {
  return error.code === 'P0001' ? new ErrorCotizacion(error.message) : error
}

/** Ejecuta una RPC que no devuelve nada y tira su error (ver errorDeRpc). */
async function llamar(rpc: PromiseLike<{ error: ErrorRpc | null }>): Promise<void> {
  const { error } = await rpc
  if (error) throw errorDeRpc(error)
}

/**
 * Crea (sin id) o actualiza una cotización con todos sus ítems. Para actualizar hace falta la versión que se editó:
 * si otro guardó en el medio, la base lo rechaza con "La cotización cambió…" y no pisa nada.
 * Devuelve el número (se asigna al crear) y la versión nueva, que es la que la pantalla manda la próxima vez.
 */
export async function guardarCotizacion(
  supabase: Cliente,
  payload: PayloadGuardar,
  id?: string,
  version?: string,
): Promise<{ id: string; numero: number; version: string }> {
  const { data: guardada, error } = await supabase.rpc('guardar_cotizacion', {
    p_datos: payload.p_datos as Json,
    p_items: payload.p_items as Json,
    p_id: id,
    p_updated_at: id ? version : undefined,
  })
  if (error) throw errorDeRpc(error)

  // La RPC devuelve solo el id. Si otro guardara justo entre las dos llamadas, acá se leería su versión y el
  // próximo guardado lo pisaría sin aviso: es una ventana de milisegundos que se acepta.
  const { data: fila, error: errorLectura } = await supabase
    .from('cotizaciones')
    .select('numero, updated_at')
    .eq('id', guardada)
    .single()
  if (errorLectura) throw errorLectura
  return { id: guardada, numero: fila.numero, version: fila.updated_at }
}

/**
 * Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada. Devuelve el id del envío,
 * para descargar exactamente ese PDF (/cotizaciones/{id}/pdf?envio={envioId}&descargar=1).
 */
export async function enviarCotizacion(supabase: Cliente, id: string, version?: string): Promise<{ envioId: string }> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  exigirVersion(fila, version)
  exigirEnviable(fila)

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  await llamar(supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: fila.updated_at, p_pdf_path: ruta }))

  // La ruta lleva la hora en milisegundos y no se pisa: identifica el envío que se acaba de registrar.
  const { data: envio, error } = await supabase
    .from('cotizacion_envios')
    .select('id')
    .eq('cotizacion_id', id)
    .eq('pdf_path', ruta)
    .single()
  if (error) throw error
  return { envioId: envio.id }
}

/**
 * La cotización que esta reemplaza (renegociación), si es un presupuesto aprobado en curso: la pantalla ofrece
 * finalizarlo. La aprobación ya quedó registrada, así que si esta lectura falla no se ofrece nada (no es un error).
 */
async function anteriorEnCurso(
  supabase: Cliente,
  reemplazaA: string | null,
): Promise<{ id: string; numero: number } | null> {
  if (!reemplazaA) return null
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, numero, estado, presupuesto_estado')
    .eq('id', reemplazaA)
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
export async function aprobarCotizacion(
  supabase: Cliente,
  id: string,
  fecha?: string,
  version?: string,
): Promise<{ anterior: { id: string; numero: number } | null }> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  exigirVersion(fila, version)
  const fechaAprobacion = fecha ?? hoyArgentina()
  exigirAprobable(fila, fechaAprobacion)

  let ruta: string | undefined
  if (fila.origen !== 'importada') {
    const pdf = await renderizarCotizacion(documentoCompleto(fuente))
    ruta = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
    await subirPdf(supabase, ruta, pdf)
  }
  await llamar(
    supabase.rpc('aprobar_cotizacion', {
      p_id: id,
      p_updated_at: fila.updated_at,
      p_pdf_path: ruta,
      p_fecha: fechaAprobacion,
    }),
  )
  return { anterior: await anteriorEnCurso(supabase, fila.reemplaza_a) }
}

/** Desde borrador o enviada (de la app o cargada). */
export async function rechazarCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('rechazar_cotizacion', { p_id: id }))
}

/** Una rechazada de la app vuelve a borrador; una cargada, a enviada. */
export async function reabrirCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('reabrir_cotizacion', { p_id: id }))
}

/** Vuelve a enviada (si tuvo envíos o es cargada) o a borrador. No con documentos activos ni en un directo. */
export async function revertirAprobacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('revertir_aprobacion', { p_id: id }))
}

/** Un borrador que nunca se envió, o una cargada que no está aprobada. */
export async function borrarCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('borrar_cotizacion', { p_id: id }))
}

/** Copia como borrador nuevo del mismo cliente (queda como renegociación: reemplaza_a). */
export async function duplicarCotizacion(supabase: Cliente, id: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('duplicar_cotizacion', { p_id: id })
  if (error) throw errorDeRpc(error)
  return { id: data }
}

/** Finaliza el presupuesto de una cotización aprobada (la anterior de una renegociación). */
export async function finalizarPresupuesto(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' }))
}

export type EntradaVistaPrevia = { estado: EstadoEditor }

async function leerCliente(supabase: Cliente, id: string) {
  const { data, error } = await supabase.from('clientes').select('id, razon_social, cuit').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** El contacto solo si es de ese cliente (como exige la base al guardar). */
async function leerContacto(supabase: Cliente, clienteId: string, id: string) {
  const { data, error } = await supabase
    .from('contactos')
    .select('nombre, email')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function leerEquipo(supabase: Cliente, id: string) {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, descripcion, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function leerFirmante(supabase: Cliente, id: string) {
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
export async function vistaPrevia(supabase: Cliente, { estado }: EntradaVistaPrevia): Promise<Buffer> {
  const clienteId = estado.cliente?.id
  const [cliente, contacto, equipo, firmante, empresa] = await Promise.all([
    clienteId ? leerCliente(supabase, clienteId) : null,
    clienteId && estado.contactoId ? leerContacto(supabase, clienteId, estado.contactoId) : null,
    estado.equipoId ? leerEquipo(supabase, estado.equipoId) : null,
    estado.firmanteId ? leerFirmante(supabase, estado.firmanteId) : null,
    leerEmpresa(supabase),
  ])
  const catalogos: CatalogosEditor = {
    plantillas: [],
    equipos: equipo ? [equipo] : [],
    firmantes: firmante ? [firmante] : [],
    empresa,
  }
  // fuenteDesdeEditor toma equipo y firmante de los catálogos por id, y usa hoy si la fecha está a medio escribir.
  const releido: EstadoEditor = { ...estado, cliente }
  const documento = armarDocumento(fuenteDesdeEditor(releido, catalogos, contacto))
  return renderizarCotizacion(documento, { resaltarVariables: true })
}

async function descargar(supabase: Cliente, ruta: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/** La ruta del PDF del último envío de la cotización, o null si nunca se envió. */
async function rutaUltimoEnvio(supabase: Cliente, id: string): Promise<string | null> {
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
const CON_ENVIO = ['enviada', 'rechazada']

/**
 * El PDF que corresponde mostrar: el de un envío puntual, el congelado de una aprobada,
 * el original de una cotización cargada, el último envío de una enviada (o rechazada después de
 * enviarse) o uno generado en el momento (borradores y lo que nunca se envió).
 * Una enviada se puede seguir editando sin cambiar de estado: generarla en el momento mostraría
 * algo que el cliente no recibió. Un presupuesto directo no tiene PDF (null, igual que una inexistente).
 * Con `actual` (la vista previa en el celular), una de la app que no está aprobada se genera en el momento con lo
 * guardado, aunque se haya enviado, y con las variables sin completar en amarillo.
 */
export async function pdfParaMostrar(
  supabase: Cliente,
  id: string,
  envioId?: string,
  opciones: { actual?: boolean } = {},
): Promise<{ pdf: Buffer; nombreArchivo: string } | null> {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) return null
  const { fila, fuente } = cargada
  const nombreArchivo = nombreArchivoCotizacion(fila.numero, fuente.cliente.razon_social)

  if (envioId) {
    const { data: envio, error } = await supabase
      .from('cotizacion_envios')
      .select('pdf_path')
      .eq('id', envioId)
      .eq('cotizacion_id', id)
      .maybeSingle()
    if (error) throw error
    if (!envio) return null
    return { pdf: await descargar(supabase, envio.pdf_path), nombreArchivo }
  }

  // Un presupuesto directo no tiene PDF: generarlo mostraría una cotización que nunca existió.
  if (fila.origen === 'directa') return null

  const actual = opciones.actual === true && fila.origen === 'app' && fila.estado !== 'aprobada'
  const guardado = actual
    ? null
    : (fila.pdf_aprobado_path ??
      fila.archivo_original_path ??
      (CON_ENVIO.includes(fila.estado) ? await rutaUltimoEnvio(supabase, id) : null))
  if (guardado) return { pdf: await descargar(supabase, guardado), nombreArchivo }

  return { pdf: await renderizarCotizacion(armarDocumento(fuente), { resaltarVariables: actual }), nombreArchivo }
}
