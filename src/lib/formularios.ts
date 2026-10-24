import type { ZodError } from 'zod'

export type EstadoFormulario = {
  ok: boolean
  mensaje: string | null
  errores: Partial<Record<string, string>>
  /** Lo que envió el usuario: se vuelve a mostrar si la acción falla (React resetea el form). */
  valores?: Record<string, string>
}

export type AccionFormulario = (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>

export const ESTADO_INICIAL: EstadoFormulario = { ok: false, mensaje: null, errores: {} }

export function leerCampos<const K extends string>(formData: FormData, campos: readonly K[]): Record<K, string> {
  const datos = {} as Record<K, string>
  for (const campo of campos) {
    const valor = formData.get(campo)
    datos[campo] = typeof valor === 'string' ? valor : ''
  }
  return datos
}

export function falloValidacion(error: ZodError, valores: Record<string, string>): EstadoFormulario {
  const errores: Record<string, string> = {}
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? '')
    if (campo && !errores[campo]) errores[campo] = issue.message
  }
  return { ok: false, mensaje: 'Revisá los datos marcados', errores, valores }
}

type ErrorBase = { code?: string; message: string }

export function mensajeErrorBase(error: ErrorBase): string {
  switch (error.code) {
    case '23505':
      return 'Ya existe un registro con esos datos'
    case '23514':
      return 'Algún dato no es válido'
    case '42501':
      return 'No tenés permiso para hacer esta operación'
    case 'P0001':
      return error.message
    default:
      return 'No se pudo guardar. Probá de nuevo en un momento.'
  }
}

/** Error de Postgres/PostgREST. Si es un duplicado y se indica el campo, el error va a ese campo. */
export function falloBase(
  error: ErrorBase,
  valores: Record<string, string>,
  duplicado?: { campo: string; mensaje: string },
): EstadoFormulario {
  if (error.code === '23505' && duplicado) {
    return { ok: false, mensaje: duplicado.mensaje, errores: { [duplicado.campo]: duplicado.mensaje }, valores }
  }
  return { ok: false, mensaje: mensajeErrorBase(error), errores: {}, valores }
}

export function exito(mensaje: string): EstadoFormulario {
  return { ok: true, mensaje, errores: {} }
}

export function valorCampo(
  estado: EstadoFormulario,
  inicial: Partial<Record<string, string | null>> | undefined,
  campo: string,
): string {
  return estado.valores?.[campo] ?? inicial?.[campo] ?? ''
}
