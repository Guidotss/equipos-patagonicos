import { readBlocks } from './content'
import { parsearFormat } from './format'
import { variablesUsadas, type NameVariable } from './variables'

/** Oraciones de las plantillas que usan alguna de estas variables, sin viñetas ni negritas y sin repetir. */
export function phrasesWithVariables(plantillas: { bloques: unknown }[], names: readonly NameVariable[]): string[] {
  const phrases = new Set<string>()
  for (const { bloques } of plantillas) {
    for (const block of readBlocks(bloques)) {
      for (const nodo of parsearFormat(block.contenido)) {
        const texto = nodo.segmentos.map((segmento) => segmento.texto).join('')
        if (variablesUsadas(texto).some((nombre) => (names as readonly string[]).includes(nombre))) phrases.add(texto)
      }
    }
  }
  return [...phrases]
}
