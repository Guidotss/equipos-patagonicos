/** Variables que pueden usar las plantillas. La clave es el nombre entre llaves: {{capacidad}}. */
export const VARIABLES = {
  numero: 'Número de cotización',
  capacidad: 'Capacidad del equipo (TN)',
  equipo_descripcion: 'Descripción del equipo ofrecido',
  ubicacion: 'Lugar del servicio',
  horario: 'Horario',
  plazo_entrega: 'Plazo de entrega',
  duracion_estimada: 'Tiempo estimado de contratación',
  forma_pago: 'Forma de pago',
  disponibilidad: 'Disponibilidad',
  validez_dias: 'Validez (días)',
  indice_base: 'Mes base del índice FADEEAC',
  proxima_actualizacion: 'Próxima actualización de tarifas',
} as const

export type NombreVariable = keyof typeof VARIABLES

const PATRON_VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g

export function esVariable(nombre: string): nombre is NombreVariable {
  return Object.hasOwn(VARIABLES, nombre)
}

export function variablesUsadas(texto: string): string[] {
  return [...new Set(Array.from(texto.matchAll(PATRON_VARIABLE), (m) => m[1]))]
}

export function variablesDesconocidas(texto: string): string[] {
  return variablesUsadas(texto).filter((nombre) => !esVariable(nombre))
}

/** Reemplaza las variables conocidas que tienen valor; las vacías quedan como {{x}} y se informan. */
export function resolverVariables(
  texto: string,
  valores: Partial<Record<NombreVariable, string>>,
): { texto: string; faltantes: NombreVariable[] } {
  const faltantes = new Set<NombreVariable>()
  const resultado = texto.replace(PATRON_VARIABLE, (original, nombre: string) => {
    if (!esVariable(nombre)) return original
    const valor = valores[nombre]?.trim()
    if (!valor) {
      faltantes.add(nombre)
      return original
    }
    return valor
  })
  return { texto: resultado, faltantes: [...faltantes] }
}
