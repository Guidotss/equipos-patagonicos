// src/lib/plantillas/edicion.ts
// Edición del formato mínimo de los bloques de texto, el que entiende parsearFormato y dibuja el PDF (decisión 5):
// negrita con **, viñeta con "- ", subviñeta con "  - " y quitar sangría. Funciones puras sobre el texto y la
// selección de un textarea, más la limpieza de lo que se pega desde Word.
import type { Bloque } from './contenido'

/** Selección de un textarea (selectionStart / selectionEnd). Vacía = cursor. */
export type Seleccion = { inicio: number; fin: number }
/** Texto nuevo y la selección que tiene que quedar marcada. */
export type Edicion = { texto: string; seleccion: Seleccion }

// Las mismas marcas que parsearFormato (formato.ts): nivel 2 con dos o más espacios o tabs antes.
const MARCA_NIVEL_2 = /^[ \t]{2,}[-•] /
const MARCA_NIVEL_1 = /^[-•] /
const MARCAS = { 0: '', 1: '- ', 2: '  - ' } as const

/** 0 = párrafo, 1 = viñeta, 2 = subviñeta. */
export function nivelDeLinea(linea: string): 0 | 1 | 2 {
  if (MARCA_NIVEL_2.test(linea)) return 2
  if (MARCA_NIVEL_1.test(linea)) return 1
  return 0
}

/** La línea sin su marca de viñeta ni la sangría del principio. */
function sinMarca(linea: string): string {
  return linea.replace(MARCA_NIVEL_2, '').replace(MARCA_NIVEL_1, '').replace(/^[ \t]+/, '')
}

function largoMarca(linea: string): number {
  return linea.length - sinMarca(linea).length
}

function conNivel(linea: string, nivel: 0 | 1 | 2): string {
  return `${MARCAS[nivel]}${sinMarca(linea)}`
}

/** Las líneas que toca la selección (con un cursor, la del cursor). Si termina al principio de una línea, esa no. */
function lineasTocadas(texto: string, seleccion: Seleccion) {
  const inicio = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const lineas = texto.split('\n')
  const lineaDe = (posicion: number) => texto.slice(0, posicion).split('\n').length - 1
  const primera = lineaDe(inicio)
  let ultima = lineaDe(fin)
  if (fin > inicio && ultima > primera && texto[fin - 1] === '\n') ultima -= 1
  const desde = lineas.slice(0, primera).reduce((suma, linea) => suma + linea.length + 1, 0)
  return { lineas, primera, ultima, inicio, fin, desde }
}

/**
 * Reemplaza cada línea tocada por `transformar(linea)`. Con selección, quedan marcadas las líneas enteras; con un
 * cursor, el cursor queda en el mismo lugar del texto de la línea (después de la marca nueva).
 */
function editarLineas(texto: string, seleccion: Seleccion, transformar: (linea: string) => string): Edicion {
  const { lineas, primera, ultima, inicio, fin, desde } = lineasTocadas(texto, seleccion)
  const viejas = lineas.slice(primera, ultima + 1)
  const nuevas = viejas.map(transformar)
  const resultado = [...lineas.slice(0, primera), ...nuevas, ...lineas.slice(ultima + 1)].join('\n')
  if (inicio === fin) {
    const [vieja] = viejas
    const [nueva] = nuevas
    const enLinea = Math.max(largoMarca(nueva), inicio - desde - largoMarca(vieja) + largoMarca(nueva))
    const cursor = desde + Math.min(enLinea, nueva.length)
    return { texto: resultado, seleccion: { inicio: cursor, fin: cursor } }
  }
  return { texto: resultado, seleccion: { inicio: desde, fin: desde + nuevas.join('\n').length } }
}

const tieneTexto = (linea: string) => sinMarca(linea).trim() !== ''

/** Viñeta (nivel 1) o subviñeta (nivel 2) en las líneas tocadas; si ya lo son todas, vuelven a ser párrafo. */
export function alternarVineta(texto: string, seleccion: Seleccion, nivel: 1 | 2): Edicion {
  const { lineas, primera, ultima } = lineasTocadas(texto, seleccion)
  const conTexto = lineas.slice(primera, ultima + 1).filter(tieneTexto)
  // En una línea vacía pone la marca, para empezar a escribir la viñeta.
  if (conTexto.length === 0) return editarLineas(texto, seleccion, () => MARCAS[nivel])
  const quitar = conTexto.every((linea) => nivelDeLinea(linea) === nivel)
  return editarLineas(texto, seleccion, (linea) => (tieneTexto(linea) ? conNivel(linea, quitar ? 0 : nivel) : linea))
}

/** Quitar sangría: subviñeta → viñeta → párrafo. */
export function quitarSangria(texto: string, seleccion: Seleccion): Edicion {
  return editarLineas(texto, seleccion, (linea) => {
    const nivel = nivelDeLinea(linea)
    return nivel === 0 ? linea : conNivel(linea, nivel === 2 ? 1 : 0)
  })
}

// Una línea (o pedazo de línea) toda en negrita, con su marca de viñeta y espacios afuera: "- **texto** ".
const EN_NEGRITA = /^(\s*(?:[-•] )?)\*\*((?:(?!\*\*).)+)\*\*(\s*)$/
const PARTES_LINEA = /^(\s*(?:[-•] )?)(.*?)(\s*)$/

function envolver(pieza: string): string {
  if (EN_NEGRITA.test(pieza)) return pieza
  const [, marca = '', contenido = '', espacios = ''] = PARTES_LINEA.exec(pieza) ?? []
  // Sin asteriscos adentro: "**a** b" en negrita queda "**a b**", no "****a** b**".
  return contenido === '' ? pieza : `${marca}**${contenido.replaceAll('**', '')}**${espacios}`
}

function desenvolver(pieza: string): string {
  const partes = EN_NEGRITA.exec(pieza)
  return partes ? `${partes[1]}${partes[2]}${partes[3]}` : pieza
}

/** Los tramos en negrita de una línea, [apertura, cierre + 2), con los ** emparejados como en parsearNegritas. */
function tramosEnNegrita(linea: string): Array<[number, number]> {
  const marcas: number[] = []
  for (let marca = linea.indexOf('**'); marca !== -1; marca = linea.indexOf('**', marca + 2)) marcas.push(marca)
  const tramos: Array<[number, number]> = []
  // Un ** sin pareja al final es texto, no abre nada.
  for (let indice = 0; indice + 1 < marcas.length; indice += 2) tramos.push([marcas[indice], marcas[indice + 1] + 2])
  return tramos
}

/**
 * Si el borde de la selección cae dentro de un tramo en negrita (o entre los dos * de una marca), lo lleva a la
 * apertura de ese tramo (borde de inicio) o después de su cierre (borde de fin). Si no, los ** que quedan afuera de
 * la selección se desparejan y salen literales en el PDF.
 */
function bordeFueraDeNegrita(texto: string, posicion: number, borde: 'inicio' | 'fin'): number {
  // El borde ya no es un espacio ni un salto, así que la línea es la del carácter en `posicion` (inicio) o el de
  // antes (fin): en los dos casos, la que empieza después del último salto anterior a `posicion`.
  const comienzo = texto.lastIndexOf('\n', posicion - 1) + 1
  const salto = texto.indexOf('\n', posicion)
  const linea = texto.slice(comienzo, salto === -1 ? texto.length : salto)
  const enLinea = posicion - comienzo
  const tramo = tramosEnNegrita(linea).find(([apertura, cierre]) => apertura < enLinea && enLinea < cierre)
  if (!tramo) return posicion
  return comienzo + (borde === 'inicio' ? tramo[0] : tramo[1])
}

// Una variable como la escriben las plantillas (el patrón de variables.ts), sin cruzar saltos de línea.
const VARIABLE = /\{\{[^{}\n]*\}\}/g

/**
 * Si un borde de la selección cae dentro de una variable ({{…}}, también entre sus dos llaves), lo lleva al borde de
 * la variable: el de inicio a su "{{" y el de fin después de su "}}". Con el cursor adentro, queda toda elegida.
 */
export function extenderAVariables(texto: string, seleccion: Seleccion): Seleccion {
  let inicio = Math.min(seleccion.inicio, seleccion.fin)
  let fin = Math.max(seleccion.inicio, seleccion.fin)
  for (const variable of texto.matchAll(VARIABLE)) {
    const apertura = variable.index
    const cierre = apertura + variable[0].length
    if (apertura < inicio && inicio < cierre) inicio = apertura
    if (apertura < fin && fin < cierre) fin = cierre
  }
  return { inicio, fin }
}

/**
 * Negrita sobre la selección (botón o Ctrl/⌘+B). Envuelve en ** cada línea seleccionada por separado porque el
 * formato no cruza saltos de línea; si ya estaba toda en negrita, la quita. Una selección que empieza o termina
 * dentro de una negrita se extiende hasta sus ** ("**ho[la** mu]ndo" actúa sobre "[**hola** mu]ndo"), así que
 * elegir una parte de una negrita la quita entera. Tampoco corta una variable: la selección que empieza o termina
 * dentro de una toma la variable entera (extenderAVariables). Sin selección, inserta "****" con el cursor en el medio
 * (o los saca si el cursor está justo entre "**" y "**"); con el cursor dentro de una variable, la pone en negrita.
 */
export function alternarNegrita(texto: string, seleccion: Seleccion): Edicion {
  let inicio = Math.min(seleccion.inicio, seleccion.fin)
  let fin = Math.max(seleccion.inicio, seleccion.fin)
  const antes = (posicion: number) => (posicion >= 2 ? texto.slice(posicion - 2, posicion) : '')
  const despues = (posicion: number) => texto.slice(posicion, posicion + 2)

  if (inicio !== fin) {
    // Los espacios y saltos de los bordes quedan afuera de la negrita.
    while (inicio < fin && /\s/.test(texto[inicio])) inicio += 1
    while (fin > inicio && /\s/.test(texto[fin - 1])) fin -= 1
    if (inicio === fin) return { texto, seleccion }
  }

  // Los ** nunca cortan una variable: un borde (o el cursor) dentro de {{…}} toma la variable entera.
  const sinCortar = extenderAVariables(texto, { inicio, fin })
  inicio = sinCortar.inicio
  fin = sinCortar.fin

  if (inicio === fin) {
    if (antes(inicio) === '**' && despues(fin) === '**') {
      return { texto: texto.slice(0, inicio - 2) + texto.slice(fin + 2), seleccion: { inicio: inicio - 2, fin: inicio - 2 } }
    }
    return { texto: `${texto.slice(0, inicio)}****${texto.slice(fin)}`, seleccion: { inicio: inicio + 2, fin: inicio + 2 } }
  }

  // Solo el borde de la primera línea y el de la última pueden caer dentro de una negrita. También cubre la negrita
  // seleccionada sin sus asteriscos: "**[hola]**" pasa a "[**hola**]" y se quita.
  inicio = bordeFueraDeNegrita(texto, inicio, 'inicio')
  fin = bordeFueraDeNegrita(texto, fin, 'fin')

  const elegido = texto.slice(inicio, fin)
  const piezas = elegido.split('\n')
  const quitar = piezas.filter((pieza) => pieza.trim() !== '').every((pieza) => EN_NEGRITA.test(pieza))
  const nuevo = piezas
    .map((pieza) => (pieza.trim() === '' ? pieza : quitar ? desenvolver(pieza) : envolver(pieza)))
    .join('\n')
  return { texto: texto.slice(0, inicio) + nuevo + texto.slice(fin), seleccion: { inicio, fin: inicio + nuevo.length } }
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
function conMarcaDelFormato(linea: string, variasLineas: boolean, anterior: string | undefined): string {
  if (MARCA_NIVEL_2.test(linea)) return linea.replace(/\t/g, ' ')
  if (VINETA_PEGADA_2.test(linea)) return `${MARCAS[2]}${linea.replace(VINETA_PEGADA_2, '')}`
  if (VINETA_PEGADA_1.test(linea)) return `${MARCAS[1]}${linea.replace(VINETA_PEGADA_1, '')}`
  if (variasLineas && VINETA_PEGADA_3.test(linea)) {
    // El formato tiene dos niveles: debajo de una subviñeta, el tercer nivel de Word sigue siendo subviñeta.
    const nivel = anterior !== undefined && nivelDeLinea(anterior) === 2 ? 2 : 1
    return `${MARCAS[nivel]}${linea.replace(VINETA_PEGADA_3, '')}`
  }
  return linea
}

/**
 * Lo pegado se lleva al formato mínimo: saltos de Windows, espacios duros, tabs y viñetas de Word. Varias líneas se
 * recortan al final una por una; una sola línea sin viñeta no ("palabra " pegada en medio de una frase conserva el
 * espacio).
 */
export function limpiarPegado(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, '\n').replace(ESPACIOS_DUROS, ' ').split('\n')
  const variasLineas = lineas.length > 1
  const limpias: string[] = []
  for (const linea of lineas) {
    const limpia = conMarcaDelFormato(linea, variasLineas, limpias.at(-1)).replace(/(?<=\S)\t+/g, ' ')
    limpias.push(variasLineas || nivelDeLinea(limpia) !== 0 ? limpia.trimEnd() : limpia)
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
  let prefijo = 0
  while (prefijo < maximo && viejo[prefijo] === nuevo[prefijo]) prefijo += 1
  let sufijo = 0
  // El final en común no se superpone con el principio ("aa" → "aaa" agrega una "a" al final, no antes de empezar).
  while (sufijo < maximo - prefijo && viejo[viejo.length - 1 - sufijo] === nuevo[nuevo.length - 1 - sufijo]) {
    sufijo += 1
  }
  return { inicio: prefijo, fin: viejo.length - sufijo, reemplazo: nuevo.slice(prefijo, nuevo.length - sufijo) }
}

/** Reemplaza la selección por lo pegado (ya limpio) y deja el cursor al final de lo pegado. */
export function pegar(texto: string, seleccion: Seleccion, pegado: string): Edicion {
  const inicio = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const limpio = limpiarPegado(pegado)
  const cursor = inicio + limpio.length
  return { texto: texto.slice(0, inicio) + limpio + texto.slice(fin), seleccion: { inicio: cursor, fin: cursor } }
}

/**
 * El bloque de la plantilla que corresponde a `bloques[indice]` (decisión 6: "Restaurar este bloque" solo si existe):
 * el de mismo título y mismo número de aparición de ese título, así el segundo "Sin título" se restaura con el segundo
 * de la plantilla.
 */
export function bloqueDePlantilla(
  plantilla: Bloque[],
  bloques: Pick<Bloque, 'titulo'>[],
  indice: number,
): Bloque | null {
  const titulo = bloques[indice]?.titulo.trim()
  if (titulo === undefined) return null
  const aparicion = bloques.slice(0, indice).filter((bloque) => bloque.titulo.trim() === titulo).length
  return plantilla.filter((bloque) => bloque.titulo.trim() === titulo)[aparicion] ?? null
}

/** true si los bloques son los de la plantilla, en el mismo orden y visibles: no hay nada que restaurar. */
export function mismosBloques(bloques: Bloque[], plantilla: Bloque[]): boolean {
  return (
    bloques.length === plantilla.length &&
    bloques.every(
      (bloque, indice) =>
        bloque.titulo === plantilla[indice].titulo &&
        bloque.contenido === plantilla[indice].contenido &&
        bloque.oculto === plantilla[indice].oculto,
    )
  )
}
