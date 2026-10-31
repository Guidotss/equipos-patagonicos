import { readBlocks, type Format, type Unit } from '@/lib/templates/content'
import type { SourceDocument } from '../document'

import { ErrorQuote, type QuoteServiceClient as Client } from './contracts'

/** Datos de la empresa que van en el PDF (membrete, pie y valores por defecto de las variables). */
export async function readCompany(supabase: Client): Promise<SourceDocument['empresa']> {
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
export async function loadQuoteSource(supabase: Client, id: string) {
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

export async function requireQuoteSource(supabase: Client, id: string) {
  const loadedQuote = await loadQuoteSource(supabase, id)
  if (!loadedQuote) throw new ErrorQuote('La cotización no existe')
  return loadedQuote
}

export type Row = NonNullable<Awaited<ReturnType<typeof loadQuoteSource>>>['fila']

export async function readClient(supabase: Client, id: string) {
  const { data, error } = await supabase.from('clientes').select('id, razon_social, cuit').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** El contacto solo si es de ese cliente (como exige la base al guardar). */
export async function readContact(supabase: Client, clientId: string, id: string) {
  const { data, error } = await supabase
    .from('contactos')
    .select('nombre, email')
    .eq('id', id)
    .eq('cliente_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function readEquipment(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, descripcion, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function readSigner(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}
