// src/lib/cotizaciones/grilla.ts
// Lógica de la grilla de ítems del editor: filas de sección, cantidades y precios escritos o pegados, totales y
// adónde va el foco después de agregar o borrar, y los errores de guardado de cada fila. Pura (UI y Vitest). Las
// reglas de las secciones al mover o renombrar están en el reducer (editor.ts).
import { formatAmountTable, parsePrice } from '@/lib/format/amounts'
import type { ItemEditor } from './editor'

type ItemGrid = Pick<ItemEditor, 'clave' | 'seccion'>

export type RowSection = { tipo: 'seccion'; clave: string; index: number; seccion: string; numero: number }
export type RowGrid = RowSection | { tipo: 'item'; index: number }

/**
 * Filas a dibujar. Si algún ítem tiene sección (la plantilla por jornada), cada grupo consecutivo de la misma
 * sección lleva un encabezado, igual que en el PDF; `clave` e `indice` son los de su primer ítem.
 */
export function rowsGrid(items: ItemGrid[]): RowGrid[] {
  const withSections = items.some((item) => item.seccion.trim() !== '')
  const rows: RowGrid[] = []
  let numero = 0
  items.forEach((item, index) => {
    if (withSections && (index === 0 || items[index - 1].seccion !== item.seccion)) {
      numero += 1
      rows.push({ tipo: 'seccion', clave: item.clave, index, seccion: item.seccion, numero })
    }
    rows.push({ tipo: 'item', index })
  })
  return rows
}

/** Cantidad escrita al estilo argentino ("1", "2,5"): un número mayor a 0, o null. */
export function readQuantity(texto: string): number | null {
  const cantidad = parsePrice(texto)
  return cantidad !== null && cantidad > 0 ? cantidad : null
}

/** Cómo queda la celda Precio al salir: "39000000" → "39.000.000,00". Lo que no es un monto queda igual. */
export function normalizePrice(texto: string): string {
  const price = parsePrice(texto)
  return price === null ? texto.trim() : formatAmountTable(price)
}

const redondear = (value: number) => Math.round(value * 100) / 100

/** Cantidad × precio, redondeado a centavos; null si falta alguno o no se entiende. */
export function totalLine(item: Pick<ItemEditor, 'cantidad' | 'precio'>): number | null {
  const cantidad = readQuantity(item.cantidad)
  const price = parsePrice(item.precio)
  if (cantidad === null || price === null) return null
  return redondear(cantidad * price)
}

/** Total de la cotización (solo si todas las líneas tienen total, como el PDF) y cuántos ítems no tienen precio. */
export function totalGeneral(items: Pick<ItemEditor, 'cantidad' | 'precio'>[]): {
  total: number | null
  withoutPrice: number
} {
  const withoutPrice = items.filter((item) => parsePrice(item.precio) === null).length
  const totales = items.map((item) => totalLine(item))
  if (items.length === 0 || totales.some((total) => total === null)) return { total: null, withoutPrice }
  return { total: redondear(totales.reduce<number>((sum, total) => sum + (total ?? 0), 0)), withoutPrice }
}

/** Nombre para una sección nueva que no se confunda ni se pegue con las que ya hay. */
export function nameSectionNew(items: ItemGrid[]): string {
  const groups = items.filter((item, index) => index === 0 || items[index - 1].seccion !== item.seccion).length
  const names = new Set(items.map((item) => item.seccion))
  let numero = groups + 1
  while (names.has(`Sección ${numero}`)) numero += 1
  return `Sección ${numero}`
}

export type PedidoFoco =
  /** La fila que quedó después de esta (Enter, Duplicar fila). */
  | { tipo: 'siguiente'; clave: string }
  /** Esta fila (la vecina de una que se borró). */
  | { tipo: 'item'; clave: string }
  /** La última fila (+ Agregar ítem). */
  | { tipo: 'ultimo' }
  /** El nombre de la última sección (+ Agregar sección). */
  | { tipo: 'seccionUltima' }

export type DestinationFoco = { clave: string; campo: 'descripcion' | 'seccion' }

/**
 * Adónde va el foco después de un cambio en la grilla. Se calcula con la lista ya actualizada porque las claves
 * nuevas las pone el reducer.
 */
export function destinationFoco(pedido: PedidoFoco, items: ItemGrid[]): DestinationFoco | null {
  switch (pedido.tipo) {
    case 'siguiente': {
      const index = items.findIndex((item) => item.clave === pedido.clave)
      const next = index === -1 ? undefined : items[index + 1]
      return next ? { clave: next.clave, campo: 'descripcion' } : null
    }
    case 'item':
      return items.some((item) => item.clave === pedido.clave) ? { clave: pedido.clave, campo: 'descripcion' } : null
    case 'ultimo': {
      const last = items.at(-1)
      return last ? { clave: last.clave, campo: 'descripcion' } : null
    }
    case 'seccionUltima': {
      let index = items.length - 1
      if (index < 0) return null
      while (index > 0 && items[index - 1].seccion === items[index].seccion) index -= 1
      return { clave: items[index].clave, campo: 'seccion' }
    }
  }
}

/** El ítem que recibe el foco cuando se borra otro: el anterior; si era el primero, el siguiente. */
export function vecinoOnQuitar(items: ItemGrid[], clave: string): string | null {
  const index = items.findIndex((item) => item.clave === clave)
  if (index === -1) return null
  return (items[index - 1] ?? items[index + 1])?.clave ?? null
}

/** Celdas de un ítem que pueden traer un error de guardado. */
export type FieldGrid = 'seccion' | 'descripcion' | 'cantidad' | 'precio' | 'unidad'
export type ErrorsItem = Partial<Record<FieldGrid, string>>

const PATH_CELL = /^items\.(\d+)\.(seccion|descripcion|cantidad|precio|unidad)$/

/**
 * Errores de guardado de los ítems por clave de fila. Las rutas ('items.2.precio') usan la posición de cada ítem en
 * lo que se mandó a guardar, así que `claves` son las de esos ítems (en ese orden), no las de la lista que haya cuando
 * vuelve la respuesta: así la marca queda en el ítem que la tuvo aunque mientras tanto o después se agregue,
 * duplique, mueva o borre otro.
 */
export function errorsByKey(errors: Record<string, string>, keys: string[]): Record<string, ErrorsItem> {
  const byKey: Record<string, ErrorsItem> = {}
  for (const [path, message] of Object.entries(errors)) {
    const partes = PATH_CELL.exec(path)
    const clave = partes ? keys[Number(partes[1])] : undefined
    if (!partes || clave === undefined) continue
    byKey[clave] = { ...byKey[clave], [partes[2] as FieldGrid]: message }
  }
  return byKey
}
