// src/lib/documentos/servicio.ts
// Documentos del lado del servidor. Recibe el cliente de Supabase por parámetro (sesión del usuario).
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { conNombreDeDescarga, rutaArchivo, validarArchivo, type MimePermitido } from './archivos'
import type { DatosDocumento } from './esquemas'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorDocumento extends Error {}

function errorDeRpc(error: { code?: string; message: string }) {
  return error.code === 'P0001' ? new ErrorDocumento(error.message) : error
}

/** Valida el archivo y devuelve la ruta y el token para que el navegador suba directo a Storage. */
export async function prepararSubida(
  supabase: Cliente,
  archivo: { clienteId: string; mime: string; tamano: number },
): Promise<{ path: string; token: string }> {
  const problema = validarArchivo(archivo)
  if (problema) throw new ErrorDocumento(problema)
  const ruta = rutaArchivo(archivo.clienteId, archivo.mime as MimePermitido)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(ruta)
  if (error) throw error
  return { path: data.path, token: data.token }
}

export type ArchivoSubido = { path: string; nombre_original: string }

export async function registrarDocumento(
  supabase: Cliente,
  entrada: {
    clienteId: string
    presupuestos: string[]
    datos: DatosDocumento
    archivos: ArchivoSubido[]
    remitos?: string[]
    aplicaciones?: { factura_id: string; monto_aplicado: number }[]
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_documento', {
    p_datos: { ...entrada.datos, cliente_id: entrada.clienteId },
    p_presupuestos: entrada.presupuestos,
    p_archivos: entrada.archivos,
    p_remitos: entrada.remitos ?? [],
    p_aplicaciones: entrada.aplicaciones ?? [],
  })
  if (error) throw errorDeRpc(error)
  return data
}

/** URL firmada por 60 segundos que descarga el archivo con su nombre original. */
export async function urlDescarga(supabase: Cliente, ruta: string, nombreOriginal: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60)
  if (error) throw error
  return conNombreDeDescarga(data.signedUrl, nombreOriginal)
}
