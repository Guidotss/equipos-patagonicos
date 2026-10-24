// src/lib/cotizaciones/servicio.ts
// Orquesta cotizaciones del lado del servidor. Recibe el cliente de Supabase por parámetro
// (el de la sesión del usuario), así respeta la RLS y se puede probar en integración.
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerBloques, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { nombreArchivoCotizacion } from '@/lib/pdf/nombre-archivo'
import { renderizarCotizacion } from '@/lib/pdf/render'
import type { Database } from '@/lib/supabase/database.types'
import { armarDocumento, type DocumentoCotizacion, type FuenteDocumento } from './documento'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorCotizacion extends Error {}

/**
 * Lee la cotización con todo lo que necesita el PDF en una sola consulta: así `updated_at`
 * (la versión que se manda a las RPC) corresponde exactamente al contenido que se dibuja.
 */
async function cargarFuente(supabase: Cliente, id: string) {
  const { data: fila, error } = await supabase
    .from('cotizaciones')
    .select(
      `id, numero, fecha, formato, asunto, intro, validez_dias, mostrar_total, datos, bloques, estado, origen,
       updated_at, pdf_aprobado_path, archivo_original_path,
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

  const { data: empresa, error: errorEmpresa } = await supabase
    .from('empresa_config')
    .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
    .single()
  if (errorEmpresa) throw errorEmpresa

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
    empresa,
  }
  return { fila, fuente }
}

async function cargarOFallar(supabase: Cliente, id: string) {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) throw new ErrorCotizacion('La cotización no existe')
  return cargada
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

function errorDeRpc(error: { code?: string; message: string }) {
  return error.code === 'P0001' ? new ErrorCotizacion(error.message) : error
}

/** Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada. */
export async function enviarCotizacion(supabase: Cliente, id: string): Promise<void> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  if (fila.origen !== 'app') throw new ErrorCotizacion('Una cotización cargada no se envía desde la app: su documento es el PDF original')

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  const { error } = await supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: fila.updated_at, p_pdf_path: ruta })
  if (error) throw errorDeRpc(error)
}

/**
 * Aprueba (la cotización queda congelada). Si se armó en la app, genera y guarda el PDF definitivo;
 * si es una cotización cargada, se aprueba con su PDF original y no se genera nada.
 */
export async function aprobarCotizacion(supabase: Cliente, id: string, fecha?: string): Promise<void> {
  const { fila, fuente } = await cargarOFallar(supabase, id)

  if (fila.origen === 'importada') {
    const { error } = await supabase.rpc('aprobar_cotizacion', { p_id: id, p_updated_at: fila.updated_at, p_fecha: fecha })
    if (error) throw errorDeRpc(error)
    return
  }

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  const { error } = await supabase.rpc('aprobar_cotizacion', {
    p_id: id,
    p_updated_at: fila.updated_at,
    p_pdf_path: ruta,
    p_fecha: fecha,
  })
  if (error) throw errorDeRpc(error)
}

async function descargar(supabase: Cliente, ruta: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/**
 * El PDF que corresponde mostrar: el de un envío puntual, el congelado de una aprobada,
 * el original de una cotización cargada, o uno generado en el momento (borradores).
 */
export async function pdfParaMostrar(
  supabase: Cliente,
  id: string,
  envioId?: string,
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

  const guardado = fila.pdf_aprobado_path ?? fila.archivo_original_path
  if (guardado) return { pdf: await descargar(supabase, guardado), nombreArchivo }

  return { pdf: await renderizarCotizacion(armarDocumento(fuente)), nombreArchivo }
}
