// src/lib/quotes/grid.ts
// Lógica de la grilla de ítems del editor: filas de sección, cantidades y precios escritos o pegados, totales y
// adónde va el foco después de agregar o borrar, y los errores de guardado de cada fila. Pura (UI y Vitest). Las
// reglas de las secciones al mover o renombrar están en el reducer (editor.ts).
import { formatAmountTable, parsePrice } from '@/lib/format/amounts'
import type { ItemEditor } from './editor/types'

type ItemGrid = Pick<ItemEditor, 'clave' | 'seccion'>

export type RowSection = { type: 'seccion'; key: string; index: number; section: string; number: number }
export type RowGrid = RowSection | { type: 'item'; index: number }

/**
 * Filas a dibujar. Si algún ítem tiene sección (la plantilla por jornada), cada grupo consecutivo de la misma
 * sección lleva un encabezado, igual que en el PDF; `clave` e `indice` son los de su primer ítem.
 */
export function rowsGrid(items: ItemGrid[]): RowGrid[] {
  const withSections = items.some((item) => item.seccion.trim() !== '')
  const rows: RowGrid[] = []
  let number = 0
  items.forEach((item, index) => {
    if (withSections && (index === 0 || items[index - 1].seccion !== item.seccion)) {
      number += 1
      rows.push({ type: 'seccion', key: item.clave, index, section: item.seccion, number })
    }
    rows.push({ type: 'item', index })
  })
  return rows
}

/** Cantidad escrita al estilo argentino ("1", "2,5"): un número mayor a 0, o null. */
export function readQuantity(text: string): number | null {
  const quantity = parsePrice(text)
  return quantity !== null && quantity > 0 ? quantity : null
}

/** Cómo queda la celda Precio al salir: "39000000" → "39.000.000,00". Lo que no es un monto queda igual. */
export function normalizePrice(text: string): string {
  const price = parsePrice(text)
  return price === null ? text.trim() : formatAmountTable(price)
}

const roundAmount = (value: number) => Math.round(value * 100) / 100

/** Cantidad × precio, redondeado a centavos; null si falta alguno o no se entiende. */
export function totalLine(item: Pick<ItemEditor, 'cantidad' | 'precio'>): number | null {
  const quantity = readQuantity(item.cantidad)
  const price = parsePrice(item.precio)
  if (quantity === null || price === null) return null
  return roundAmount(quantity * price)
}

/** Total de la cotización (solo si todas las líneas tienen total, como el PDF) y cuántos ítems no tienen precio. */
export function totalGeneral(items: Pick<ItemEditor, 'cantidad' | 'precio'>[]): {
  total: number | null
  withoutPrice: number
} {
  const withoutPrice = items.filter((item) => parsePrice(item.precio) === null).length
  const totals = items.map((item) => totalLine(item))
  if (items.length === 0 || totals.some((total) => total === null)) return { total: null, withoutPrice }
  return { total: roundAmount(totals.reduce<number>((sum, total) => sum + (total ?? 0), 0)), withoutPrice }
}

/** Nombre para una sección nueva que no se confunda ni se pegue con las que ya hay. */
export function nameSectionNew(items: ItemGrid[]): string {
  const groups = items.filter((item, index) => index === 0 || items[index - 1].seccion !== item.seccion).length
  const names = new Set(items.map((item) => item.seccion))
  let number = groups + 1
  while (names.has(`Sección ${number}`)) number += 1
  return `Sección ${number}`
}

export type FocusRequest =
  /** La fila que quedó después de esta (Enter, Duplicar fila). */
  | { type: 'siguiente'; key: string }
  /** Esta fila (la vecina de una que se borró). */
  | { type: 'item'; key: string }
  /** La última fila (+ Agregar ítem). */
  | { type: 'ultimo' }
  /** El nombre de la última sección (+ Agregar sección). */
  | { type: 'seccionUltima' }

export type FocusDestination = { key: string; field: 'descripcion' | 'seccion' }

/**
 * Adónde va el foco después de un cambio en la grilla. Se calcula con la lista ya actualizada porque las claves
 * nuevas las pone el reducer.
 */
export function focusDestination(request: FocusRequest, items: ItemGrid[]): FocusDestination | null {
  switch (request.type) {
    case 'siguiente': {
      const index = items.findIndex((item) => item.clave === request.key)
      const next = index === -1 ? undefined : items[index + 1]
      return next ? { key: next.clave, field: 'descripcion' } : null
    }
    case 'item':
      return items.some((item) => item.clave === request.key) ? { key: request.key, field: 'descripcion' } : null
    case 'ultimo': {
      const last = items.at(-1)
      return last ? { key: last.clave, field: 'descripcion' } : null
    }
    case 'seccionUltima': {
      let index = items.length - 1
      if (index < 0) return null
      while (index > 0 && items[index - 1].seccion === items[index].seccion) index -= 1
      return { key: items[index].clave, field: 'seccion' }
    }
  }
}

/** El ítem que recibe el foco cuando se borra otro: el anterior; si era el primero, el siguiente. */
export function neighborOnRemove(items: ItemGrid[], key: string): string | null {
  const index = items.findIndex((item) => item.clave === key)
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
    const parts = PATH_CELL.exec(path)
    const key = parts ? keys[Number(parts[1])] : undefined
    if (!parts || key === undefined) continue
    byKey[key] = { ...byKey[key], [parts[2] as FieldGrid]: message }
  }
  return byKey
}
