// tests/integration/documentos-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { adminClient, sql } from './helpers'

type Cliente = SupabaseClient<Database>

/** Crea un presupuesto (presupuesto directo, ya aprobado) del cliente dado. */
export async function nuevoPresupuesto(cliente: Cliente, clienteId: string, marca: string): Promise<string> {
  const { data, error } = await cliente.rpc('presupuesto_directo', {
    p_datos: { cliente_id: clienteId, asunto: `Presupuesto de prueba ${marca}`, notas: marca },
    p_items: [],
  })
  if (error) throw error
  return data
}

/** Sube un PDF chico a documentos/<clienteId>/ con la sesión del usuario y devuelve lo que espera registrar_documento. */
export async function subirArchivo(cliente: Cliente, clienteId: string, nombre = 'Remito Neuquén N° 1.pdf') {
  return subirArchivoEn(cliente, `documentos/${clienteId}/${crypto.randomUUID()}.pdf`, nombre)
}

/** Sube un PDF a una ruta cualquiera del bucket (para probar rutas que no arma rutaArchivo). */
export async function subirArchivoEn(
  cliente: Cliente,
  path: string,
  nombre = 'Remito Neuquén N° 1.pdf',
  contenido = '%PDF-1.4 prueba',
) {
  const { error } = await cliente.storage
    .from('documentos')
    .upload(path, new Blob([contenido], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  if (error) throw error
  return { path, nombre_original: nombre }
}

/** Borra los documentos de prueba (por notas) y sus archivos en Storage. */
export async function limpiarDocumentos(marca: string) {
  const archivos = await sql<{ path: string }>(
    `select a.path from public.documento_archivos a join public.documentos d on d.id = a.documento_id where d.notas = $1`,
    [marca],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.path))
  await sql(
    `delete from public.op_facturas where op_id in (select id from public.documentos where notas = $1)
       or factura_id in (select id from public.documentos where notas = $1)`,
    [marca],
  )
  await sql(`update public.documentos set factura_id = null where notas = $1`, [marca])
  await sql('delete from public.documentos where notas = $1', [marca])
  await sql('delete from public.cotizaciones where notas = $1', [marca])
}
