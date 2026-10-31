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

export type NameVariable = keyof typeof VARIABLES

// Captura todo lo que haya entre llaves dobles, para que un nombre mal tipeado ({{ubicación}}) se informe como desconocido.
// Los espacios se recortan con trim() y no en el patrón: varios cuantificadores que aceptan espacios seguidos
// tardan O(n^3) con un "{{" sin cerrar seguido de muchos espacios (ReDoS).
const PATRON_VARIABLE = /\{\{([^{}]*)\}\}/g

export function isVariable(nombre: string): nombre is NameVariable {
  return Object.hasOwn(VARIABLES, nombre)
}

export function variablesUsadas(texto: string): string[] {
  return [...new Set(Array.from(texto.matchAll(PATRON_VARIABLE), (m) => m[1].trim()))]
}

/** "con base en {{ indice_base }}." → ['con base en ', 'indice_base', '.']: los nombres quedan en las posiciones impares. */
export function partirVariables(texto: string): string[] {
  return texto.split(PATRON_VARIABLE).map((parte, index) => (index % 2 === 1 ? parte.trim() : parte))
}

export function variablesDesconocidas(texto: string): string[] {
  return variablesUsadas(texto).filter((nombre) => !isVariable(nombre))
}

/** Reemplaza las variables conocidas que tienen valor; las vacías quedan como {{x}} y se informan. */
export function resolverVariables(
  texto: string,
  values: Partial<Record<NameVariable, string>>,
): { texto: string; faltantes: NameVariable[] } {
  const faltantes = new Set<NameVariable>()
  const result = texto.replace(PATRON_VARIABLE, (original, capturado: string) => {
    const nombre = capturado.trim()
    if (!isVariable(nombre)) return original
    const value = values[nombre]?.trim()
    if (!value) {
      faltantes.add(nombre)
      return original
    }
    return value
  })
  return { texto: result, faltantes: [...faltantes] }
}
