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

// Captura todo lo que haya entre llaves dobles, para que un nombre mal tipeado ({{ubicación}}) se informe como desconocido.
// Los espacios se recortan con trim() y no en el patrón: varios cuantificadores que aceptan espacios seguidos
// tardan O(n^3) con un "{{" sin cerrar seguido de muchos espacios (ReDoS).
const PATRON_VARIABLE = /\{\{([^{}]*)\}\}/g

export function esVariable(nombre: string): nombre is NombreVariable {
  return Object.hasOwn(VARIABLES, nombre)
}

export function variablesUsadas(texto: string): string[] {
  return [...new Set(Array.from(texto.matchAll(PATRON_VARIABLE), (m) => m[1].trim()))]
}

/** "con base en {{ indice_base }}." → ['con base en ', 'indice_base', '.']: los nombres quedan en las posiciones impares. */
export function partirVariables(texto: string): string[] {
  return texto.split(PATRON_VARIABLE).map((parte, indice) => (indice % 2 === 1 ? parte.trim() : parte))
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
  const resultado = texto.replace(PATRON_VARIABLE, (original, capturado: string) => {
    const nombre = capturado.trim()
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
