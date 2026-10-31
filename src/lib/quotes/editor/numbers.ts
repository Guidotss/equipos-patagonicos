const withoutDecimals = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' })
const withDecimals = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** Precio guardado → texto de la celda: "39.000.000" o "1.950.000,50". parsePrecio lo vuelve a leer igual. */
export function textPrice(price: number): string {
  return Number.isInteger(price) ? withoutDecimals.format(price) : withDecimals.format(price)
}

/** Cantidad guardada → texto de la celda, con coma decimal: 1 → "1", 1.5 → "1,5". */
export function textQuantity(cantidad: number): string {
  return String(cantidad).replace('.', ',')
}
