export type Segmento = { texto: string; negrita: boolean }

export type NodoFormato =
  | { tipo: 'parrafo'; segmentos: Segmento[] }
  | { tipo: 'vineta'; nivel: 1 | 2; segmentos: Segmento[] }

const VINETA_NIVEL_2 = /^[ \t]{2,}[-•] (.*)$/
const VINETA_NIVEL_1 = /^[-•] (.*)$/

/** "a **b** c" → tramos con y sin negrita. Un "**" sin cerrar queda como texto. */
export function parsearNegritas(texto: string): Segmento[] {
  const partes = texto.split('**')
  if (partes.length % 2 === 0) {
    const ultima = partes.pop() ?? ''
    partes[partes.length - 1] += `**${ultima}`
  }
  return partes
    .map((parte, indice) => ({ texto: parte, negrita: indice % 2 === 1 }))
    .filter((segmento) => segmento.texto !== '')
}

/** Convierte el texto de un bloque (formato mínimo) en párrafos y viñetas. */
export function parsearFormato(texto: string): NodoFormato[] {
  const nodos: NodoFormato[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '') continue
    const nivel2 = VINETA_NIVEL_2.exec(linea)
    if (nivel2) {
      nodos.push({ tipo: 'vineta', nivel: 2, segmentos: parsearNegritas(nivel2[1]) })
      continue
    }
    const nivel1 = VINETA_NIVEL_1.exec(linea)
    if (nivel1) {
      nodos.push({ tipo: 'vineta', nivel: 1, segmentos: parsearNegritas(nivel1[1]) })
      continue
    }
    nodos.push({ tipo: 'parrafo', segmentos: parsearNegritas(linea.trim()) })
  }
  return nodos
}
