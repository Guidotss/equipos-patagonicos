import type { ZodError } from 'zod'

export type StatusForm = {
  ok: boolean
  message: string | null
  errors: Partial<Record<string, string>>
  /** Lo que envió el usuario: se vuelve a mostrar si la acción falla (React resetea el form). */
  values?: Record<string, string>
}

export type ActionForm = (estado: StatusForm, formData: FormData) => Promise<StatusForm>

export const STATUS_INITIAL: StatusForm = { ok: false, message: null, errors: {} }

export function readFields<const K extends string>(formData: FormData, fields: readonly K[]): Record<K, string> {
  const datos = {} as Record<K, string>
  for (const field of fields) {
    const value = formData.get(field)
    datos[field] = typeof value === 'string' ? value : ''
  }
  return datos
}

export function falloValidation(error: ZodError, values: Record<string, string>): StatusForm {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    if (field && !errors[field]) errors[field] = issue.message
  }
  return { ok: false, message: 'Revisá los datos marcados', errors, values }
}

/**
 * Errores de Zod con la ruta completa como clave ('items.2.precio', 'datos.ubicacion'; '' si el error es del objeto
 * entero), con el primer mensaje de cada ruta. Para los formularios con listas, donde `falloValidacion` no alcanza
 * (se queda con el primer tramo de la ruta).
 */
export function errorsByPath(error: ZodError): Record<string, string> {
  // Un Map y no un objeto: una ruta como 'constructor' o '__proto__' no choca con las propiedades heredadas.
  const errors = new Map<string, string>()
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.')
    if (!errors.has(path)) errors.set(path, issue.message)
  }
  return Object.fromEntries(errors)
}

type ErrorBase = { code?: string; message: string }

export function messageErrorBase(error: ErrorBase): string {
  switch (error.code) {
    case '23505':
      return 'Ya existe un registro con esos datos'
    case '23514':
      return 'Algún dato no es válido'
    case '42501':
      return 'No tenés permiso para hacer esta operación'
    case 'P0001':
      return error.message
    case '22003':
      return 'Algún número es demasiado grande'
    default:
      return 'No se pudo guardar. Probá de nuevo en un momento.'
  }
}

/** Error de Postgres/PostgREST. Si es un duplicado y se indica el campo, el error va a ese campo. */
export function falloBase(
  error: ErrorBase,
  values: Record<string, string>,
  duplicado?: { campo: string; message: string },
): StatusForm {
  if (error.code === '23505' && duplicado) {
    return { ok: false, message: duplicado.message, errors: { [duplicado.campo]: duplicado.message }, values }
  }
  return { ok: false, message: messageErrorBase(error), errors: {}, values }
}

export function success(message: string): StatusForm {
  return { ok: true, message, errors: {} }
}

export function valueField(
  estado: StatusForm,
  initial: Partial<Record<string, string | null>> | undefined,
  field: string,
): string {
  return estado.values?.[field] ?? initial?.[field] ?? ''
}
