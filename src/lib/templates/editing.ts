// src/lib/plantillas/edicion.ts
// Edición del formato mínimo de los bloques de texto, el que entiende parsearFormato y dibuja el PDF (decisión 5):
// negrita con **, viñeta con "- ", subviñeta con "  - " y quitar sangría. Funciones puras sobre el texto y la
// selección de un textarea, más la limpieza de lo que se pega desde Word.
import type { Block } from './content'

/** Selección de un textarea (selectionStart / selectionEnd). Vacía = cursor. */
export type Seleccion = { inicio: number; fin: number }
/** Texto nuevo y la selección que tiene que quedar marcada. */
export type Editing = { texto: string; seleccion: Seleccion }

// Las mismas marcas que parsearFormato (formato.ts): nivel 2 con dos o más espacios o tabs antes.
const MARK_NIVEL_2 = /^[ \t]{2,}[-•] /
const MARK_NIVEL_1 = /^[-•] /
const MARCAS = { 0: '', 1: '- ', 2: '  - ' } as const

/** 0 = párrafo, 1 = viñeta, 2 = subviñeta. */
export function nivelOfLine(line: string): 0 | 1 | 2 {
  if (MARK_NIVEL_2.test(line)) return 2
  if (MARK_NIVEL_1.test(line)) return 1
  return 0
}

/** La línea sin su marca de viñeta ni la sangría del principio. */
function withoutMark(line: string): string {
  return line.replace(MARK_NIVEL_2, '').replace(MARK_NIVEL_1, '').replace(/^[ \t]+/, '')
}

function largoMark(line: string): number {
  return line.length - withoutMark(line).length
}

function withNivel(line: string, nivel: 0 | 1 | 2): string {
  return `${MARCAS[nivel]}${withoutMark(line)}`
}

/** Las líneas que toca la selección (con un cursor, la del cursor). Si termina al principio de una línea, esa no. */
function linesTocadas(texto: string, seleccion: Seleccion) {
  const home = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const lines = texto.split('\n')
  const lineOf = (position: number) => texto.slice(0, position).split('\n').length - 1
  const primera = lineOf(home)
  let last = lineOf(fin)
  if (fin > home && last > primera && texto[fin - 1] === '\n') last -= 1
  const desde = lines.slice(0, primera).reduce((sum, line) => sum + line.length + 1, 0)
  return { lines, primera, last, inicio: home, fin, desde }
}

/**
 * Reemplaza cada línea tocada por `transformar(linea)`. Con selección, quedan marcadas las líneas enteras; con un
 * cursor, el cursor queda en el mismo lugar del texto de la línea (después de la marca nueva).
 */
function editLines(texto: string, seleccion: Seleccion, transformar: (line: string) => string): Editing {
  const { lines, primera, last, inicio: home, fin, desde } = linesTocadas(texto, seleccion)
  const viejas = lines.slice(primera, last + 1)
  const nuevas = viejas.map(transformar)
  const result = [...lines.slice(0, primera), ...nuevas, ...lines.slice(last + 1)].join('\n')
  if (home === fin) {
    const [vieja] = viejas
    const [nueva] = nuevas
    const inLine = Math.max(largoMark(nueva), home - desde - largoMark(vieja) + largoMark(nueva))
    const cursor = desde + Math.min(inLine, nueva.length)
    return { texto: result, seleccion: { inicio: cursor, fin: cursor } }
  }
  return { texto: result, seleccion: { inicio: desde, fin: desde + nuevas.join('\n').length } }
}

const tieneText = (line: string) => withoutMark(line).trim() !== ''

/** Viñeta (nivel 1) o subviñeta (nivel 2) en las líneas tocadas; si ya lo son todas, vuelven a ser párrafo. */
export function alternarVineta(texto: string, seleccion: Seleccion, nivel: 1 | 2): Editing {
  const { lines, primera, last } = linesTocadas(texto, seleccion)
  const withText = lines.slice(primera, last + 1).filter(tieneText)
  // En una línea vacía pone la marca, para empezar a escribir la viñeta.
  if (withText.length === 0) return editLines(texto, seleccion, () => MARCAS[nivel])
  const quitar = withText.every((line) => nivelOfLine(line) === nivel)
  return editLines(texto, seleccion, (line) => (tieneText(line) ? withNivel(line, quitar ? 0 : nivel) : line))
}

/** Quitar sangría: subviñeta → viñeta → párrafo. */
export function quitarSangria(texto: string, seleccion: Seleccion): Editing {
  return editLines(texto, seleccion, (line) => {
    const nivel = nivelOfLine(line)
    return nivel === 0 ? line : withNivel(line, nivel === 2 ? 1 : 0)
  })
}

// Una línea (o pedazo de línea) toda en negrita, con su marca de viñeta y espacios afuera: "- **texto** ".
const IN_NEGRITA = /^(\s*(?:[-•] )?)\*\*((?:(?!\*\*).)+)\*\*(\s*)$/
const PARTES_LINE = /^(\s*(?:[-•] )?)(.*?)(\s*)$/

function envolver(pieza: string): string {
  if (IN_NEGRITA.test(pieza)) return pieza
  const [, marca = '', content = '', espacios = ''] = PARTES_LINE.exec(pieza) ?? []
  // Sin asteriscos adentro: "**a** b" en negrita queda "**a b**", no "****a** b**".
  return content === '' ? pieza : `${marca}**${content.replaceAll('**', '')}**${espacios}`
}

function desenvolver(pieza: string): string {
  const partes = IN_NEGRITA.exec(pieza)
  return partes ? `${partes[1]}${partes[2]}${partes[3]}` : pieza
}

/** Los tramos en negrita de una línea, [apertura, cierre + 2), con los ** emparejados como en parsearNegritas. */
function tramosInNegrita(line: string): Array<[number, number]> {
  const marcas: number[] = []
  for (let marca = line.indexOf('**'); marca !== -1; marca = line.indexOf('**', marca + 2)) marcas.push(marca)
  const tramos: Array<[number, number]> = []
  // Un ** sin pareja al final es texto, no abre nada.
  for (let index = 0; index + 1 < marcas.length; index += 2) tramos.push([marcas[index], marcas[index + 1] + 2])
  return tramos
}

/**
 * Si el borde de la selección cae dentro de un tramo en negrita (o entre los dos * de una marca), lo lleva a la
 * apertura de ese tramo (borde de inicio) o después de su cierre (borde de fin). Si no, los ** que quedan afuera de
 * la selección se desparejan y salen literales en el PDF.
 */
function bordeFueraOfNegrita(texto: string, position: number, borde: 'inicio' | 'fin'): number {
  // El borde ya no es un espacio ni un salto, así que la línea es la del carácter en `posicion` (inicio) o el de
  // antes (fin): en los dos casos, la que empieza después del último salto anterior a `posicion`.
  const comienzo = texto.lastIndexOf('\n', position - 1) + 1
  const salto = texto.indexOf('\n', position)
  const line = texto.slice(comienzo, salto === -1 ? texto.length : salto)
  const inLine = position - comienzo
  const tramo = tramosInNegrita(line).find(([apertura, closing]) => apertura < inLine && inLine < closing)
  if (!tramo) return position
  return comienzo + (borde === 'inicio' ? tramo[0] : tramo[1])
}

// Una variable como la escriben las plantillas (el patrón de variables.ts), sin cruzar saltos de línea.
const VARIABLE = /\{\{[^{}\n]*\}\}/g

/**
 * Si un borde de la selección cae dentro de una variable ({{…}}, también entre sus dos llaves), lo lleva al borde de
 * la variable: el de inicio a su "{{" y el de fin después de su "}}". Con el cursor adentro, queda toda elegida.
 */
export function extenderAVariables(texto: string, seleccion: Seleccion): Seleccion {
  let home = Math.min(seleccion.inicio, seleccion.fin)
  let fin = Math.max(seleccion.inicio, seleccion.fin)
  for (const variable of texto.matchAll(VARIABLE)) {
    const apertura = variable.index
    const closing = apertura + variable[0].length
    if (apertura < home && home < closing) home = apertura
    if (apertura < fin && fin < closing) fin = closing
  }
  return { inicio: home, fin }
}

/**
 * Negrita sobre la selección (botón o Ctrl/⌘+B). Envuelve en ** cada línea seleccionada por separado porque el
 * formato no cruza saltos de línea; si ya estaba toda en negrita, la quita. Una selección que empieza o termina
 * dentro de una negrita se extiende hasta sus ** ("**ho[la** mu]ndo" actúa sobre "[**hola** mu]ndo"), así que
 * elegir una parte de una negrita la quita entera. Tampoco corta una variable: la selección que empieza o termina
 * dentro de una toma la variable entera (extenderAVariables). Sin selección, inserta "****" con el cursor en el medio
 * (o los saca si el cursor está justo entre "**" y "**"); con el cursor dentro de una variable, la pone en negrita.
 */
export function alternarNegrita(texto: string, seleccion: Seleccion): Editing {
  let home = Math.min(seleccion.inicio, seleccion.fin)
  let fin = Math.max(seleccion.inicio, seleccion.fin)
  const antes = (position: number) => (position >= 2 ? texto.slice(position - 2, position) : '')
  const despues = (position: number) => texto.slice(position, position + 2)

  if (home !== fin) {
    // Los espacios y saltos de los bordes quedan afuera de la negrita.
    while (home < fin && /\s/.test(texto[home])) home += 1
    while (fin > home && /\s/.test(texto[fin - 1])) fin -= 1
    if (home === fin) return { texto, seleccion }
  }

  // Los ** nunca cortan una variable: un borde (o el cursor) dentro de {{…}} toma la variable entera.
  const withoutCortar = extenderAVariables(texto, { inicio: home, fin })
  home = withoutCortar.inicio
  fin = withoutCortar.fin

  if (home === fin) {
    if (antes(home) === '**' && despues(fin) === '**') {
      return { texto: texto.slice(0, home - 2) + texto.slice(fin + 2), seleccion: { inicio: home - 2, fin: home - 2 } }
    }
    return { texto: `${texto.slice(0, home)}****${texto.slice(fin)}`, seleccion: { inicio: home + 2, fin: home + 2 } }
  }

  // Solo el borde de la primera línea y el de la última pueden caer dentro de una negrita. También cubre la negrita
  // seleccionada sin sus asteriscos: "**[hola]**" pasa a "[**hola**]" y se quita.
  home = bordeFueraOfNegrita(texto, home, 'inicio')
  fin = bordeFueraOfNegrita(texto, fin, 'fin')

  const chosen = texto.slice(home, fin)
  const piezas = chosen.split('\n')
  const quitar = piezas.filter((pieza) => pieza.trim() !== '').every((pieza) => IN_NEGRITA.test(pieza))
  const nuevo = piezas
    .map((pieza) => (pieza.trim() === '' ? pieza : quitar ? desenvolver(pieza) : envolver(pieza)))
    .join('\n')
  return { texto: texto.slice(0, home) + nuevo + texto.slice(fin), seleccion: { inicio: home, fin: home + nuevo.length } }
}

// Viñetas de Word o de un mail pegadas como texto: "•\t", "·  " (nivel 1) y "o\t", "◦\t" (nivel 2).
const VINETA_PEGADA_2 = /^[ \t]*(?:o|◦)\t+[ \t]*/
const VINETA_PEGADA_1 = /^[ \t]*[-–•·●▪■][ \t]+/
// El tercer nivel de Word ("§\t"). Solo en un pegado de varias líneas: en una sola es el signo de párrafo
// ("§ 5 del contrato").
const VINETA_PEGADA_3 = /^[ \t]*§[ \t]+/
// Espacio duro, espacio de cifra y espacio duro angosto (Word y los mails los usan): pasan a espacios comunes.
const ESPACIOS_DUROS = /[\u00a0\u2007\u202f]/g

/** La línea pegada con su viñeta de Word llevada a la marca del formato mínimo (o tal cual, si no tiene). */
function withMarkOfFormat(line: string, variasLines: boolean, previous: string | undefined): string {
  if (MARK_NIVEL_2.test(line)) return line.replace(/\t/g, ' ')
  if (VINETA_PEGADA_2.test(line)) return `${MARCAS[2]}${line.replace(VINETA_PEGADA_2, '')}`
  if (VINETA_PEGADA_1.test(line)) return `${MARCAS[1]}${line.replace(VINETA_PEGADA_1, '')}`
  if (variasLines && VINETA_PEGADA_3.test(line)) {
    // El formato tiene dos niveles: debajo de una subviñeta, el tercer nivel de Word sigue siendo subviñeta.
    const nivel = previous !== undefined && nivelOfLine(previous) === 2 ? 2 : 1
    return `${MARCAS[nivel]}${line.replace(VINETA_PEGADA_3, '')}`
  }
  return line
}

/**
 * Lo pegado se lleva al formato mínimo: saltos de Windows, espacios duros, tabs y viñetas de Word. Varias líneas se
 * recortan al final una por una; una sola línea sin viñeta no ("palabra " pegada en medio de una frase conserva el
 * espacio).
 */
export function limpiarPegado(texto: string): string {
  const lines = texto.replace(/\r\n?/g, '\n').replace(ESPACIOS_DUROS, ' ').split('\n')
  const variasLines = lines.length > 1
  const limpias: string[] = []
  for (const line of lines) {
    const limpia = withMarkOfFormat(line, variasLines, limpias.at(-1)).replace(/(?<=\S)\t+/g, ' ')
    limpias.push(variasLines || nivelOfLine(limpia) !== 0 ? limpia.trimEnd() : limpia)
  }
  return limpias.join('\n')
}

/**
 * El tramo de `viejo` que hay que reemplazar para llegar a `nuevo`, sin el principio ni el final que tienen en común:
 * [inicio, fin) de `viejo` y lo que va en su lugar. Las ediciones de la barra se aplican así, con un solo insertText
 * sobre ese tramo, para que entren en el historial del textarea y Ctrl/⌘+Z las deshaga.
 */
export function tramoCambiado(viejo: string, nuevo: string): { inicio: number; fin: number; reemplazo: string } {
  const maximo = Math.min(viejo.length, nuevo.length)
  let prefix = 0
  while (prefix < maximo && viejo[prefix] === nuevo[prefix]) prefix += 1
  let sufijo = 0
  // El final en común no se superpone con el principio ("aa" → "aaa" agrega una "a" al final, no antes de empezar).
  while (sufijo < maximo - prefix && viejo[viejo.length - 1 - sufijo] === nuevo[nuevo.length - 1 - sufijo]) {
    sufijo += 1
  }
  return { inicio: prefix, fin: viejo.length - sufijo, reemplazo: nuevo.slice(prefix, nuevo.length - sufijo) }
}

/** Reemplaza la selección por lo pegado (ya limpio) y deja el cursor al final de lo pegado. */
export function pegar(texto: string, seleccion: Seleccion, pegado: string): Editing {
  const home = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const limpio = limpiarPegado(pegado)
  const cursor = home + limpio.length
  return { texto: texto.slice(0, home) + limpio + texto.slice(fin), seleccion: { inicio: cursor, fin: cursor } }
}

/**
 * El bloque de la plantilla que corresponde a `bloques[indice]` (decisión 6: "Restaurar este bloque" solo si existe):
 * el de mismo título y mismo número de aparición de ese título, así el segundo "Sin título" se restaura con el segundo
 * de la plantilla.
 */
export function blockOfTemplate(
  template: Block[],
  bloques: Pick<Block, 'titulo'>[],
  index: number,
): Block | null {
  const title = bloques[index]?.titulo.trim()
  if (title === undefined) return null
  const aparicion = bloques.slice(0, index).filter((block) => block.titulo.trim() === title).length
  return template.filter((block) => block.titulo.trim() === title)[aparicion] ?? null
}

/** true si los bloques son los de la plantilla, en el mismo orden y visibles: no hay nada que restaurar. */
export function mismosBlocks(bloques: Block[], template: Block[]): boolean {
  return (
    bloques.length === template.length &&
    bloques.every(
      (block, index) =>
        block.titulo === template[index].titulo &&
        block.contenido === template[index].contenido &&
        block.hidden === template[index].hidden,
    )
  )
}
