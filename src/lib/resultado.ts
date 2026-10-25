// src/lib/resultado.ts
// Respuesta de las Server Actions que no reciben FormData (el editor de cotizaciones manda objetos).
// Solo para el servidor: importa el servicio de cotizaciones, que dibuja PDFs. Los componentes de cliente
// importan solo el tipo (`import type { Resultado } from '@/lib/resultado'`).
import { ErrorCotizacion } from '@/lib/cotizaciones/servicio'
import { mensajeErrorBase } from '@/lib/formularios'

export type Resultado<T = null> =
  | { ok: true; datos: T; mensaje?: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> }

export const MENSAJE_INESPERADO = 'No se pudo completar la operación. Probá de nuevo en un momento.'

// Códigos de Postgres (SQLSTATE: 5 caracteres) y de PostgREST (PGRST116…). Un error de Storage también trae `code`
// ('NoSuchKey'), pero no es de la base: se separa por la marca de storage-js y por la forma del código.
const CODIGO_BASE = /^(?:[0-9A-Z]{5}|PGRST\d+)$/

function esErrorDeBase(error: unknown): error is { code: string; message: string } {
  if (typeof error !== 'object' || error === null || '__isStorageError' in error) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && CODIGO_BASE.test(code) && typeof message === 'string'
}

/** Lo que devuelve mensajeErrorBase para un código que no traduce ("No se pudo guardar…"). */
const SIN_TRADUCCION = mensajeErrorBase({ code: '', message: '' })

/**
 * Mensaje para mostrarle al usuario a partir de lo que tiró el servicio o la base.
 * Uso en una acción:
 * `try { … } catch (e) { unstable_rethrow(e); return { ok: false, mensaje: mensajeParaUsuario(e) } }`.
 * - ErrorCotizacion: su mensaje (ya está pensado para el usuario).
 * - Error de Postgres/PostgREST: `mensajeErrorBase` (P0001 trae el texto de la regla de negocio). Un código que
 *   mensajeErrorBase no traduce da el genérico: su texto por defecto habla de guardar, y rechazar, duplicar o buscar
 *   no guardan.
 * - Storage, errores de programación o cualquier otra cosa: un mensaje genérico.
 * Todo lo que no es una regla de negocio se registra con console.error para poder rastrearlo en el servidor.
 */
export function mensajeParaUsuario(error: unknown): string {
  if (error instanceof ErrorCotizacion) return error.message
  if (esErrorDeBase(error)) {
    if (error.code !== 'P0001') console.error(error)
    const mensaje = mensajeErrorBase(error)
    return mensaje === SIN_TRADUCCION ? MENSAJE_INESPERADO : mensaje
  }
  console.error(error)
  return MENSAJE_INESPERADO
}
