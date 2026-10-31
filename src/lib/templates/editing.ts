// src/lib/templates/editing.ts
// Edición del formato mínimo de los bloques de texto, el que entiende parsearFormato y dibuja el PDF (decisión 5):
// negrita con **, viñeta con "- ", subviñeta con "  - " y quitar sangría. Funciones puras sobre el texto y la
// selección de un textarea, más la limpieza de lo que se pega desde Word.
import type { Block } from './content'

/** Selección de un textarea (selectionStart / selectionEnd). Vacía = cursor. */
export type TextSelection = { inicio: number; fin: number }
/** Texto nuevo y la selección que tiene que quedar marcada. */
export type Editing = { texto: string; seleccion: TextSelection }

// Las mismas marcas que parsearFormato (formato.ts): nivel 2 con dos o más espacios o tabs antes.
const LEVEL_TWO_MARK = /^[ \t]{2,}[-•] /
const LEVEL_ONE_MARK = /^[-•] /
const MARKS = { 0: '', 1: '- ', 2: '  - ' } as const

/** 0 = párrafo, 1 = viñeta, 2 = subviñeta. */
export function lineLevel(line: string): 0 | 1 | 2 {
  if (LEVEL_TWO_MARK.test(line)) return 2
  if (LEVEL_ONE_MARK.test(line)) return 1
  return 0
}

/** La línea sin su marca de viñeta ni la sangría del principio. */
function withoutMark(line: string): string {
  return line.replace(LEVEL_TWO_MARK, '').replace(LEVEL_ONE_MARK, '').replace(/^[ \t]+/, '')
}

function markLength(line: string): number {
  return line.length - withoutMark(line).length
}

function withLevel(line: string, level: 0 | 1 | 2): string {
  return `${MARKS[level]}${withoutMark(line)}`
}

/** Las líneas que toca la selección (con un cursor, la del cursor). Si termina al principio de una línea, esa no. */
function selectedLines(text: string, selection: TextSelection) {
  const home = Math.min(selection.inicio, selection.fin)
  const end = Math.max(selection.inicio, selection.fin)
  const lines = text.split('\n')
  const lineOf = (position: number) => text.slice(0, position).split('\n').length - 1
  const firstLine = lineOf(home)
  let last = lineOf(end)
  if (end > home && last > firstLine && text[end - 1] === '\n') last -= 1
  const from = lines.slice(0, firstLine).reduce((sum, line) => sum + line.length + 1, 0)
  return { lines, primera: firstLine, last, inicio: home, fin: end, desde: from }
}

/**
 * Reemplaza cada línea tocada por `transformar(linea)`. Con selección, quedan marcadas las líneas enteras; con un
 * cursor, el cursor queda en el mismo lugar del texto de la línea (después de la marca nueva).
 */
function editLines(text: string, selection: TextSelection, transformLine: (line: string) => string): Editing {
  const { lines, primera: firstLine, last, inicio: home, fin: end, desde: from } = selectedLines(text, selection)
  const previousLines = lines.slice(firstLine, last + 1)
  const nextLines = previousLines.map(transformLine)
  const result = [...lines.slice(0, firstLine), ...nextLines, ...lines.slice(last + 1)].join('\n')
  if (home === end) {
    const [previousLine] = previousLines
    const [newQuote] = nextLines
    const inLine = Math.max(markLength(newQuote), home - from - markLength(previousLine) + markLength(newQuote))
    const cursor = from + Math.min(inLine, newQuote.length)
    return { texto: result, seleccion: { inicio: cursor, fin: cursor } }
  }
  return { texto: result, seleccion: { inicio: from, fin: from + nextLines.join('\n').length } }
}

const hasText = (line: string) => withoutMark(line).trim() !== ''

/** Viñeta (nivel 1) o subviñeta (nivel 2) en las líneas tocadas; si ya lo son todas, vuelven a ser párrafo. */
export function toggleBullet(text: string, selection: TextSelection, level: 1 | 2): Editing {
  const { lines, primera: firstLine, last } = selectedLines(text, selection)
  const withText = lines.slice(firstLine, last + 1).filter(hasText)
  // En una línea vacía pone la marca, para empezar a escribir la viñeta.
  if (withText.length === 0) return editLines(text, selection, () => MARKS[level])
  const remove = withText.every((line) => lineLevel(line) === level)
  return editLines(text, selection, (line) => (hasText(line) ? withLevel(line, remove ? 0 : level) : line))
}

/** Quitar sangría: subviñeta → viñeta → párrafo. */
export function removeIndent(text: string, selection: TextSelection): Editing {
  return editLines(text, selection, (line) => {
    const level = lineLevel(line)
    return level === 0 ? line : withLevel(line, level === 2 ? 1 : 0)
  })
}

// Una línea (o pedazo de línea) toda en negrita, con su marca de viñeta y espacios afuera: "- **texto** ".
const BOLD_LINE = /^(\s*(?:[-•] )?)\*\*((?:(?!\*\*).)+)\*\*(\s*)$/
const LINE_PARTS = /^(\s*(?:[-•] )?)(.*?)(\s*)$/

function wrapBold(piece: string): string {
  if (BOLD_LINE.test(piece)) return piece
  const [, timestamp = '', content = '', spaces = ''] = LINE_PARTS.exec(piece) ?? []
  // Sin asteriscos adentro: "**a** b" en negrita queda "**a b**", no "****a** b**".
  return content === '' ? piece : `${timestamp}**${content.replaceAll('**', '')}**${spaces}`
}

function unwrapBold(piece: string): string {
  const parts = BOLD_LINE.exec(piece)
  return parts ? `${parts[1]}${parts[2]}${parts[3]}` : piece
}

/** Los tramos en negrita de una línea, [apertura, cierre + 2), con los ** emparejados como en parsearNegritas. */
function boldRanges(line: string): Array<[number, number]> {
  const marks: number[] = []
  for (let timestamp = line.indexOf('**'); timestamp !== -1; timestamp = line.indexOf('**', timestamp + 2)) marks.push(timestamp)
  const ranges: Array<[number, number]> = []
  // Un ** sin pareja al final es texto, no abre nada.
  for (let index = 0; index + 1 < marks.length; index += 2) ranges.push([marks[index], marks[index + 1] + 2])
  return ranges
}

/**
 * Si el borde de la selección cae dentro de un tramo en negrita (o entre los dos * de una marca), lo lleva a la
 * apertura de ese tramo (borde de inicio) o después de su cierre (borde de fin). Si no, los ** que quedan afuera de
 * la selección se desparejan y salen literales en el PDF.
 */
function outsideBoldBoundary(text: string, position: number, edge: 'inicio' | 'fin'): number {
  // El borde ya no es un espacio ni un salto, así que la línea es la del carácter en `posicion` (inicio) o el de
  // antes (fin): en los dos casos, la que empieza después del último salto anterior a `posicion`.
  const start = text.lastIndexOf('\n', position - 1) + 1
  const lineBreak = text.indexOf('\n', position)
  const line = text.slice(start, lineBreak === -1 ? text.length : lineBreak)
  const inLine = position - start
  const segment = boldRanges(line).find(([opening, closing]) => opening < inLine && inLine < closing)
  if (!segment) return position
  return start + (edge === 'inicio' ? segment[0] : segment[1])
}

// Una variable como la escriben las plantillas (el patrón de variables.ts), sin cruzar saltos de línea.
const VARIABLE = /\{\{[^{}\n]*\}\}/g

/**
 * Si un borde de la selección cae dentro de una variable ({{…}}, también entre sus dos llaves), lo lleva al borde de
 * la variable: el de inicio a su "{{" y el de fin después de su "}}". Con el cursor adentro, queda toda elegida.
 */
export function expandToVariables(text: string, selection: TextSelection): TextSelection {
  let home = Math.min(selection.inicio, selection.fin)
  let end = Math.max(selection.inicio, selection.fin)
  for (const variable of text.matchAll(VARIABLE)) {
    const opening = variable.index
    const closing = opening + variable[0].length
    if (opening < home && home < closing) home = opening
    if (opening < end && end < closing) end = closing
  }
  return { inicio: home, fin: end }
}

/**
 * Negrita sobre la selección (botón o Ctrl/⌘+B). Envuelve en ** cada línea seleccionada por separado porque el
 * formato no cruza saltos de línea; si ya estaba toda en negrita, la quita. Una selección que empieza o termina
 * dentro de una negrita se extiende hasta sus ** ("**ho[la** mu]ndo" actúa sobre "[**hola** mu]ndo"), así que
 * elegir una parte de una negrita la quita entera. Tampoco corta una variable: la selección que empieza o termina
 * dentro de una toma la variable entera (extenderAVariables). Sin selección, inserta "****" con el cursor en el medio
 * (o los saca si el cursor está justo entre "**" y "**"); con el cursor dentro de una variable, la pone en negrita.
 */
export function toggleBold(text: string, selection: TextSelection): Editing {
  let home = Math.min(selection.inicio, selection.fin)
  let end = Math.max(selection.inicio, selection.fin)
  const before = (position: number) => (position >= 2 ? text.slice(position - 2, position) : '')
  const after = (position: number) => text.slice(position, position + 2)

  if (home !== end) {
    // Los espacios y saltos de los bordes quedan afuera de la negrita.
    while (home < end && /\s/.test(text[home])) home += 1
    while (end > home && /\s/.test(text[end - 1])) end -= 1
    if (home === end) return { texto: text, seleccion: selection }
  }

  // Los ** nunca cortan una variable: un borde (o el cursor) dentro de {{…}} toma la variable entera.
  const wholeVariableSelection = expandToVariables(text, { inicio: home, fin: end })
  home = wholeVariableSelection.inicio
  end = wholeVariableSelection.fin

  if (home === end) {
    if (before(home) === '**' && after(end) === '**') {
      return { texto: text.slice(0, home - 2) + text.slice(end + 2), seleccion: { inicio: home - 2, fin: home - 2 } }
    }
    return { texto: `${text.slice(0, home)}****${text.slice(end)}`, seleccion: { inicio: home + 2, fin: home + 2 } }
  }

  // Solo el borde de la primera línea y el de la última pueden caer dentro de una negrita. También cubre la negrita
  // seleccionada sin sus asteriscos: "**[hola]**" pasa a "[**hola**]" y se quita.
  home = outsideBoldBoundary(text, home, 'inicio')
  end = outsideBoldBoundary(text, end, 'fin')

  const chosen = text.slice(home, end)
  const pieces = chosen.split('\n')
  const remove = pieces.filter((piece) => piece.trim() !== '').every((piece) => BOLD_LINE.test(piece))
  const next = pieces
    .map((piece) => (piece.trim() === '' ? piece : remove ? unwrapBold(piece) : wrapBold(piece)))
    .join('\n')
  return { texto: text.slice(0, home) + next + text.slice(end), seleccion: { inicio: home, fin: home + next.length } }
}

// Viñetas de Word o de un mail pegadas como texto: "•\t", "·  " (nivel 1) y "o\t", "◦\t" (nivel 2).
const PASTED_BULLET_TWO = /^[ \t]*(?:o|◦)\t+[ \t]*/
const PASTED_BULLET_ONE = /^[ \t]*[-–•·●▪■][ \t]+/
// El tercer nivel de Word ("§\t"). Solo en un pegado de varias líneas: en una sola es el signo de párrafo
// ("§ 5 del contrato").
const PASTED_BULLET_THREE = /^[ \t]*§[ \t]+/
// Espacio duro, espacio de cifra y espacio duro angosto (Word y los mails los usan): pasan a espacios comunes.
const NON_BREAKING_SPACES = /[\u00a0\u2007\u202f]/g

/** La línea pegada con su viñeta de Word llevada a la marca del formato mínimo (o tal cual, si no tiene). */
function withMarkOfFormat(line: string, multipleLines: boolean, previous: string | undefined): string {
  if (LEVEL_TWO_MARK.test(line)) return line.replace(/\t/g, ' ')
  if (PASTED_BULLET_TWO.test(line)) return `${MARKS[2]}${line.replace(PASTED_BULLET_TWO, '')}`
  if (PASTED_BULLET_ONE.test(line)) return `${MARKS[1]}${line.replace(PASTED_BULLET_ONE, '')}`
  if (multipleLines && PASTED_BULLET_THREE.test(line)) {
    // El formato tiene dos niveles: debajo de una subviñeta, el tercer nivel de Word sigue siendo subviñeta.
    const level = previous !== undefined && lineLevel(previous) === 2 ? 2 : 1
    return `${MARKS[level]}${line.replace(PASTED_BULLET_THREE, '')}`
  }
  return line
}

/**
 * Lo pegado se lleva al formato mínimo: saltos de Windows, espacios duros, tabs y viñetas de Word. Varias líneas se
 * recortan al final una por una; una sola línea sin viñeta no ("palabra " pegada en medio de una frase conserva el
 * espacio).
 */
export function cleanPastedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(NON_BREAKING_SPACES, ' ').split('\n')
  const multipleLines = lines.length > 1
  const cleanLines: string[] = []
  for (const line of lines) {
    const cleanLine = withMarkOfFormat(line, multipleLines, cleanLines.at(-1)).replace(/(?<=\S)\t+/g, ' ')
    cleanLines.push(multipleLines || lineLevel(cleanLine) !== 0 ? cleanLine.trimEnd() : cleanLine)
  }
  return cleanLines.join('\n')
}

/**
 * El tramo de `viejo` que hay que reemplazar para llegar a `nuevo`, sin el principio ni el final que tienen en común:
 * [inicio, fin) de `viejo` y lo que va en su lugar. Las ediciones de la barra se aplican así, con un solo insertText
 * sobre ese tramo, para que entren en el historial del textarea y Ctrl/⌘+Z las deshaga.
 */
export function changedRange(previous: string, next: string): { inicio: number; fin: number; reemplazo: string } {
  const maxLength = Math.min(previous.length, next.length)
  let prefix = 0
  while (prefix < maxLength && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  // El final en común no se superpone con el principio ("aa" → "aaa" agrega una "a" al final, no antes de empezar).
  while (suffix < maxLength - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) {
    suffix += 1
  }
  return { inicio: prefix, fin: previous.length - suffix, reemplazo: next.slice(prefix, next.length - suffix) }
}

/** Reemplaza la selección por lo pegado (ya limpio) y deja el cursor al final de lo pegado. */
export function pasteText(text: string, selection: TextSelection, pasted: string): Editing {
  const home = Math.min(selection.inicio, selection.fin)
  const end = Math.max(selection.inicio, selection.fin)
  const clean = cleanPastedText(pasted)
  const cursor = home + clean.length
  return { texto: text.slice(0, home) + clean + text.slice(end), seleccion: { inicio: cursor, fin: cursor } }
}

/**
 * El bloque de la plantilla que corresponde a `bloques[indice]` (decisión 6: "Restaurar este bloque" solo si existe):
 * el de mismo título y mismo número de aparición de ese título, así el segundo "Sin título" se restaura con el segundo
 * de la plantilla.
 */
export function blockOfTemplate(
  template: Block[],
  blocks: Pick<Block, 'titulo'>[],
  index: number,
): Block | null {
  const title = blocks[index]?.titulo.trim()
  if (title === undefined) return null
  const occurrence = blocks.slice(0, index).filter((block) => block.titulo.trim() === title).length
  return template.filter((block) => block.titulo.trim() === title)[occurrence] ?? null
}

/** true si los bloques son los de la plantilla, en el mismo orden y visibles: no hay nada que restaurar. */
export function sameBlocks(blocks: Block[], template: Block[]): boolean {
  return (
    blocks.length === template.length &&
    blocks.every(
      (block, index) =>
        block.titulo === template[index].titulo &&
        block.contenido === template[index].contenido &&
        block.hidden === template[index].hidden,
    )
  )
}
