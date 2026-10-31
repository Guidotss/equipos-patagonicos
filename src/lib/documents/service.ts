// src/lib/documentos/servicio.ts
// Documentos del lado del servidor. Recibe el cliente de Supabase por parámetro (sesión del usuario).
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { isUuid } from '@/lib/validation'
import { withNameOfDownload, pathFile, validateFile, type MimePermitido } from './files'
import type { DataDocument } from './schemas'

type Client = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorDocument extends Error {}

function errorOfRpc(error: { code?: string; message: string }) {
  return error.code === 'P0001' ? new ErrorDocument(error.message) : error
}

/** Valida el archivo y devuelve la ruta y el token para que el navegador suba directo a Storage. */
export async function prepareUpload(
  supabase: Client,
  archivo: { clientId: string; mime: string; tamano: number },
): Promise<{ path: string; token: string; signedUrl: string }> {
  if (!isUuid(archivo.clientId)) throw new ErrorDocument('Cliente inválido')
  const problema = validateFile(archivo)
  if (problema) throw new ErrorDocument(problema)
  const path = pathFile(archivo.clientId, archivo.mime as MimePermitido)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw error
  return { path: data.path, token: data.token, signedUrl: data.signedUrl }
}

export type FileSubido = { path: string; nombre_original: string }

export async function registerDocument(
  supabase: Client,
  entrada: {
    clientId: string
    budgets: string[]
    datos: DataDocument
    archivos: FileSubido[]
    remitos?: string[]
    aplicaciones?: { factura_id: string; monto_aplicado: number }[]
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_documento', {
    p_datos: { ...entrada.datos, cliente_id: entrada.clientId },
    p_presupuestos: entrada.budgets,
    p_archivos: entrada.archivos,
    p_remitos: entrada.remitos ?? [],
    p_aplicaciones: entrada.aplicaciones ?? [],
  })
  if (error) throw errorOfRpc(error)
  return data
}

/** URL firmada por 60 segundos que descarga el archivo con su nombre original. */
export async function urlDownload(supabase: Client, path: string, nameOriginal: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) throw error
  return withNameOfDownload(data.signedUrl, nameOriginal)
}
