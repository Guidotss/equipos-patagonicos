// tests/integration/documentos-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { adminClient, sql, withConexion } from './helpers'

type Client = SupabaseClient<Database>

/** Crea un presupuesto (presupuesto directo, ya aprobado) del cliente dado. */
export async function newBudget(cliente: Client, clientId: string, marca: string): Promise<string> {
  const { data, error } = await cliente.rpc('presupuesto_directo', {
    p_datos: { cliente_id: clientId, asunto: `Presupuesto de prueba ${marca}`, notas: marca },
    p_items: [],
  })
  if (error) throw new Error('No se pudo crear el presupuesto: ' + error.message)
  return data
}

/** Cada path que subieron los helpers en este archivo de test, para borrarlo al final aunque no se haya registrado. */
const subidos = new Set<string>()

/** Sube un PDF chico a documentos/<clienteId>/ con la sesión del usuario y devuelve lo que espera registrar_documento. */
export async function uploadFile(cliente: Client, clientId: string, nombre = 'Remito Neuquén N° 1.pdf') {
  return uploadFileIn(cliente, `documentos/${clientId}/${crypto.randomUUID()}.pdf`, nombre)
}

/** Sube un PDF a una ruta cualquiera del bucket (para probar rutas que no arma rutaArchivo). */
export async function uploadFileIn(
  cliente: Client,
  path: string,
  nombre = 'Remito Neuquén N° 1.pdf',
  content = '%PDF-1.4 prueba',
) {
  subidos.add(path)
  const { error } = await cliente.storage
    .from('documentos')
    .upload(path, new Blob([content], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  if (error) throw error
  return { path, nombre_original: nombre }
}

/** Borra los documentos de prueba (por notas) y sus archivos en Storage. */
export async function limpiarDocuments(marca: string) {
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
  await removeFinancialFixtureDocuments('notas = $1', [marca])
  await sql('delete from public.cotizaciones where notas = $1', [marca])
}

/**
 * Borra de Storage todo lo que subieron los helpers en este archivo de test: lo registrado, lo que se subió
 * para llamadas que fallan a propósito y lo desvinculado con quitar_archivo. Va en el afterAll, junto a limpiarDocumentos.
 */
export async function limpiarFilesSubidos() {
  const paths = [...subidos]
  for (let desde = 0; desde < paths.length; desde += 100) {
    const tanda = paths.slice(desde, desde + 100)
    const { error } = await adminClient().storage.from('documentos').remove(tanda)
    if (error) throw new Error('No se pudieron borrar los archivos subidos: ' + error.message)
    for (const path of tanda) subidos.delete(path)
  }
}

/** Mantenimiento exclusivo del runner desechable: borra solo filas de la fixture dentro de una transacción. */
export async function removeFinancialFixtureDocuments(predicate: string, parameters: unknown[]) {
  if (!['notas = $1', 'cliente_id = $1'].includes(predicate)) throw new Error('Filtro de limpieza no permitido')
  await withConexion(async (database) => {
    await database.query('begin')
    try {
      await database.query('set local session_replication_role = replica')
      const ids = `select id from public.documentos where ${predicate}`
      await database.query(`delete from public.financial_events where document_id in (${ids})`, parameters)
      await database.query(`delete from public.payment_allocations where instrument_id in
        (select id from public.payment_instruments where op_id in (${ids})) or invoice_id in (${ids})`, parameters)
      await database.query(`delete from public.payment_instruments where op_id in (${ids})`, parameters)
      await database.query(`delete from public.invoice_allocations where invoice_id in (${ids})`, parameters)
      // Se restauran las restricciones para la eliminación habitual de documentos y archivos.
      await database.query('set local session_replication_role = origin')
      await database.query(`delete from public.documentos where ${predicate}`, parameters)
      await database.query('commit')
    } catch (error) { await database.query('rollback'); throw error }
  })
}
