export type Segmento = { texto: string; negrita: boolean }

export type NodoFormat =
  | { tipo: 'parrafo'; segmentos: Segmento[] }
  | { tipo: 'vineta'; nivel: 1 | 2; segmentos: Segmento[] }

const VINETA_NIVEL_2 = /^[ \t]{2,}[-•] (.*)$/
const VINETA_NIVEL_1 = /^[-•] (.*)$/

/** "a **b** c" → tramos con y sin negrita. Un "**" sin cerrar queda como texto. */
export function parsearNegritas(texto: string): Segmento[] {
  const partes = texto.split('**')
  if (partes.length % 2 === 0) {
    const last = partes.pop() ?? ''
    partes[partes.length - 1] += `**${last}`
  }
  return partes
    .map((parte, index) => ({ texto: parte, negrita: index % 2 === 1 }))
    .filter((segmento) => segmento.texto !== '')
}

/** Convierte el texto de un bloque (formato mínimo) en párrafos y viñetas. */
export function parsearFormat(texto: string): NodoFormat[] {
  const nodos: NodoFormat[] = []
  for (const line of texto.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const nivel2 = VINETA_NIVEL_2.exec(line)
    if (nivel2) {
      nodos.push({ tipo: 'vineta', nivel: 2, segmentos: parsearNegritas(nivel2[1]) })
      continue
    }
    const nivel1 = VINETA_NIVEL_1.exec(line)
    if (nivel1) {
      nodos.push({ tipo: 'vineta', nivel: 1, segmentos: parsearNegritas(nivel1[1]) })
      continue
    }
    nodos.push({ tipo: 'parrafo', segmentos: parsearNegritas(line.trim()) })
  }
  return nodos
}
