const conDecimales = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

const sinDecimales = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
  useGrouping: 'always',
})

/** "39.000.000,00": columnas Precio y Total de la cotización mensual. */
export function formatMontoTabla(monto: number): string {
  return conDecimales.format(monto)
}

/** "$ 1.950.000.-": precios de la cotización por jornada. */
export function formatMontoJornada(monto: number): string {
  return `$ ${sinDecimales.format(Math.round(monto))}.-`
}

/** "$ 1.950.000,50": montos en pantalla (facturas, órdenes de pago). */
export function formatMoneda(monto: number): string {
  return `$ ${conDecimales.format(monto)}`
}

/**
 * Interpreta un precio escrito o pegado al estilo argentino.
 * El punto es separador de miles salvo que haya un único punto seguido de 1 o 2 dígitos ("2.5").
 * Devuelve null si el texto no es un monto válido (no admite negativos).
 */
export function parsePrecio(entrada: string): number | null {
  let s = entrada
    .trim()
    .replace(/^\$\s*/, '')
    .replace(/\.-$/, '')
    .replace(/-$/, '')
    .replace(/\s+/g, '')

  if (s === '') return null

  if (s.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(s)) return null
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    else if (!/^\d+\.\d{1,2}$/.test(s)) return null
  } else if (!/^\d+$/.test(s)) {
    return null
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
