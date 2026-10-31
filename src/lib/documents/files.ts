import { isUuid } from '@/lib/validation'

export const MIME_PERMITIDOS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
} as const
export type MimePermitido = keyof typeof MIME_PERMITIDOS

export const SIZE_MAXIMO = 10 * 1024 * 1024

export function isMimePermitido(mime: string): mime is MimePermitido {
  return Object.hasOwn(MIME_PERMITIDOS, mime)
}

/** Mensaje de error para mostrar, o null si el archivo se puede subir. */
export function validateFile(archivo: { mime: string; tamano: number }): string | null {
  if (!isMimePermitido(archivo.mime)) return 'Solo se aceptan PDF, JPG o PNG'
  if (!(archivo.tamano > 0)) return 'El archivo está vacío'
  if (archivo.tamano > SIZE_MAXIMO) return 'El archivo supera los 10 MB'
  return null
}

/**
 * Ruta en Storage: solo ASCII (Storage rechaza tildes, ñ y °). El nombre original se guarda en la tabla.
 * El cliente tiene que ser un UUID: es la carpeta del archivo.
 */
export function pathFile(clientId: string, mime: MimePermitido, id: string = crypto.randomUUID()): string {
  if (!isUuid(clientId)) throw new Error('clienteId inválido')
  return `documentos/${clientId}/${id}.${MIME_PERMITIDOS[mime]}`
}

/**
 * Agrega el nombre de descarga a una URL firmada. Se hace a mano porque la opción `download`
 * de storage-js codifica dos veces los nombres no ASCII ("Neuqu%C3%A9n").
 */
export function withNameOfDownload(urlFirmada: string, nombre: string): string {
  const url = new URL(urlFirmada)
  url.searchParams.set('download', nombre)
  return url.toString()
}
