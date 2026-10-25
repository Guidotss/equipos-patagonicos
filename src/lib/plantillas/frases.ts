import { leerBloques } from './contenido'
import { parsearFormato } from './formato'
import { variablesUsadas, type NombreVariable } from './variables'

/** Oraciones de las plantillas que usan alguna de estas variables, sin viñetas ni negritas y sin repetir. */
export function frasesConVariables(plantillas: { bloques: unknown }[], nombres: readonly NombreVariable[]): string[] {
  const frases = new Set<string>()
  for (const { bloques } of plantillas) {
    for (const bloque of leerBloques(bloques)) {
      for (const nodo of parsearFormato(bloque.contenido)) {
        const texto = nodo.segmentos.map((segmento) => segmento.texto).join('')
        if (variablesUsadas(texto).some((nombre) => (nombres as readonly string[]).includes(nombre))) frases.add(texto)
      }
    }
  }
  return [...frases]
}
