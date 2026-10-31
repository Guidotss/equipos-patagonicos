// src/lib/result.ts
// Respuesta de las Server Actions que no reciben FormData (el editor de cotizaciones manda objetos).
// El contrato de errores se importa sin cargar las operaciones de PDF del servicio de cotizaciones.
// Los componentes de cliente importan solo el tipo Result.
import { ErrorQuote } from '@/lib/quotes/service/contracts'
import { databaseErrorMessage } from '@/lib/forms'

export type Result<T = null> =
  | { ok: true; datos: T; message?: string }
  | { ok: false; message: string; errors?: Record<string, string> }

export const UNEXPECTED_MESSAGE = 'No se pudo completar la operación. Probá de nuevo en un momento.'

// Códigos de Postgres (SQLSTATE: 5 caracteres) y de PostgREST (PGRST116…). Un error de Storage también trae `code`
// ('NoSuchKey'), pero no es de la base: se separa por la marca de storage-js y por la forma del código.
const CODE_BASE = /^(?:[0-9A-Z]{5}|PGRST\d+)$/

function isErrorOfBase(error: unknown): error is { code: string; message: string } {
  if (typeof error !== 'object' || error === null || '__isStorageError' in error) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && CODE_BASE.test(code) && typeof message === 'string'
}

/** Lo que devuelve mensajeErrorBase para un código que no traduce ("No se pudo guardar…"). */
const WITHOUT_TRANSLATION = databaseErrorMessage({ code: '', message: '' })

/**
 * Mensaje para mostrarle al usuario a partir de lo que tiró el servicio o la base.
 * Uso en una acción:
 * `try { … } catch (e) { unstable_rethrow(e); return { ok: false, mensaje: mensajeParaUsuario(e) } }`.
 * - ErrorQuote: su mensaje (ya está pensado para el usuario).
 * - Error de Postgres/PostgREST: `mensajeErrorBase` (P0001 trae el texto de la regla de negocio). Un código que
 *   mensajeErrorBase no traduce da el genérico: su texto por defecto habla de guardar, y rechazar, duplicar o buscar
 *   no guardan.
 * - Storage, errores de programación o cualquier otra cosa: un mensaje genérico.
 * Todo lo que no es una regla de negocio se registra con console.error para poder rastrearlo en el servidor.
 */
export function messageForUser(error: unknown): string {
  if (error instanceof ErrorQuote) return error.message
  if (isErrorOfBase(error)) {
    if (error.code !== 'P0001') console.error(error)
    const message = databaseErrorMessage(error)
    return message === WITHOUT_TRANSLATION ? UNEXPECTED_MESSAGE : message
  }
  console.error(error)
  return UNEXPECTED_MESSAGE
}
