// src/lib/cotizaciones/grilla.ts
// Lógica de la grilla de ítems del editor: filas de sección, cantidades y precios escritos o pegados, totales y
// adónde va el foco después de agregar o borrar, y los errores de guardado de cada fila. Pura (UI y Vitest). Las
// reglas de las secciones al mover o renombrar están en el reducer (editor.ts).
import { formatMontoTabla, parsePrecio } from '@/lib/format/montos'
import type { ItemEditor } from './editor'

type ItemGrilla = Pick<ItemEditor, 'clave' | 'seccion'>

export type FilaSeccion = { tipo: 'seccion'; clave: string; indice: number; seccion: string; numero: number }
export type FilaGrilla = FilaSeccion | { tipo: 'item'; indice: number }

/**
 * Filas a dibujar. Si algún ítem tiene sección (la plantilla por jornada), cada grupo consecutivo de la misma
 * sección lleva un encabezado, igual que en el PDF; `clave` e `indice` son los de su primer ítem.
 */
export function filasGrilla(items: ItemGrilla[]): FilaGrilla[] {
  const conSecciones = items.some((item) => item.seccion.trim() !== '')
  const filas: FilaGrilla[] = []
  let numero = 0
  items.forEach((item, indice) => {
    if (conSecciones && (indice === 0 || items[indice - 1].seccion !== item.seccion)) {
      numero += 1
      filas.push({ tipo: 'seccion', clave: item.clave, indice, seccion: item.seccion, numero })
    }
    filas.push({ tipo: 'item', indice })
  })
  return filas
}

/** Cantidad escrita al estilo argentino ("1", "2,5"): un número mayor a 0, o null. */
export function leerCantidad(texto: string): number | null {
  const cantidad = parsePrecio(texto)
  return cantidad !== null && cantidad > 0 ? cantidad : null
}

/** Cómo queda la celda Precio al salir: "39000000" → "39.000.000,00". Lo que no es un monto queda igual. */
export function normalizarPrecio(texto: string): string {
  const precio = parsePrecio(texto)
  return precio === null ? texto.trim() : formatMontoTabla(precio)
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

/** Cantidad × precio, redondeado a centavos; null si falta alguno o no se entiende. */
export function totalLinea(item: Pick<ItemEditor, 'cantidad' | 'precio'>): number | null {
  const cantidad = leerCantidad(item.cantidad)
  const precio = parsePrecio(item.precio)
  if (cantidad === null || precio === null) return null
  return redondear(cantidad * precio)
}

/** Total de la cotización (solo si todas las líneas tienen total, como el PDF) y cuántos ítems no tienen precio. */
export function totalGeneral(items: Pick<ItemEditor, 'cantidad' | 'precio'>[]): {
  total: number | null
  sinPrecio: number
} {
  const sinPrecio = items.filter((item) => parsePrecio(item.precio) === null).length
  const totales = items.map((item) => totalLinea(item))
  if (items.length === 0 || totales.some((total) => total === null)) return { total: null, sinPrecio }
  return { total: redondear(totales.reduce<number>((suma, total) => suma + (total ?? 0), 0)), sinPrecio }
}

/** Nombre para una sección nueva que no se confunda ni se pegue con las que ya hay. */
export function nombreSeccionNueva(items: ItemGrilla[]): string {
  const grupos = items.filter((item, indice) => indice === 0 || items[indice - 1].seccion !== item.seccion).length
  const nombres = new Set(items.map((item) => item.seccion))
  let numero = grupos + 1
  while (nombres.has(`Sección ${numero}`)) numero += 1
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

export type DestinoFoco = { clave: string; campo: 'descripcion' | 'seccion' }

/**
 * Adónde va el foco después de un cambio en la grilla. Se calcula con la lista ya actualizada porque las claves
 * nuevas las pone el reducer.
 */
export function destinoFoco(pedido: PedidoFoco, items: ItemGrilla[]): DestinoFoco | null {
  switch (pedido.tipo) {
    case 'siguiente': {
      const indice = items.findIndex((item) => item.clave === pedido.clave)
      const siguiente = indice === -1 ? undefined : items[indice + 1]
      return siguiente ? { clave: siguiente.clave, campo: 'descripcion' } : null
    }
    case 'item':
      return items.some((item) => item.clave === pedido.clave) ? { clave: pedido.clave, campo: 'descripcion' } : null
    case 'ultimo': {
      const ultimo = items.at(-1)
      return ultimo ? { clave: ultimo.clave, campo: 'descripcion' } : null
    }
    case 'seccionUltima': {
      let indice = items.length - 1
      if (indice < 0) return null
      while (indice > 0 && items[indice - 1].seccion === items[indice].seccion) indice -= 1
      return { clave: items[indice].clave, campo: 'seccion' }
    }
  }
}

/** El ítem que recibe el foco cuando se borra otro: el anterior; si era el primero, el siguiente. */
export function vecinoAlQuitar(items: ItemGrilla[], clave: string): string | null {
  const indice = items.findIndex((item) => item.clave === clave)
  if (indice === -1) return null
  return (items[indice - 1] ?? items[indice + 1])?.clave ?? null
}

/** Celdas de un ítem que pueden traer un error de guardado. */
export type CampoGrilla = 'seccion' | 'descripcion' | 'cantidad' | 'precio' | 'unidad'
export type ErroresItem = Partial<Record<CampoGrilla, string>>

const RUTA_CELDA = /^items\.(\d+)\.(seccion|descripcion|cantidad|precio|unidad)$/

/**
 * Errores de guardado de los ítems por clave de fila. Las rutas ('items.2.precio') usan la posición de cada ítem en
 * lo que se mandó a guardar, así que `claves` son las de esos ítems (en ese orden), no las de la lista que haya cuando
 * vuelve la respuesta: así la marca queda en el ítem que la tuvo aunque mientras tanto o después se agregue,
 * duplique, mueva o borre otro.
 */
export function erroresPorClave(errores: Record<string, string>, claves: string[]): Record<string, ErroresItem> {
  const porClave: Record<string, ErroresItem> = {}
  for (const [ruta, mensaje] of Object.entries(errores)) {
    const partes = RUTA_CELDA.exec(ruta)
    const clave = partes ? claves[Number(partes[1])] : undefined
    if (!partes || clave === undefined) continue
    porClave[clave] = { ...porClave[clave], [partes[2] as CampoGrilla]: mensaje }
  }
  return porClave
}
