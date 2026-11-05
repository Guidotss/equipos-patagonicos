const ZERO = BigInt(0)
const HUNDRED = BigInt(100)
export const MAX_AMOUNT_CENTS = BigInt('99999999999999')

/** Decimal SQL individual exacto; nunca redondea fracciones adicionales. */
export function parseDecimalCents(value: string): bigint | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  return BigInt(integer) * HUNDRED + BigInt(fraction.padEnd(2, '0'))
}

/** Acepta el formato argentino y el decimal simple usado al pegar importes. */
export function parseAmountCents(input: string): bigint | null {
  let value = input.trim().replace(/^\$\s*/, '').replace(/\s*\.?-$/, '')
  if (value === '' || /\s/.test(value)) return null
  if (value.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(value)) return null
    value = value.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, '')
  }
  return parseDecimalCents(value)
}

/** Sumas de muchas filas pueden superar Number.MAX_SAFE_INTEGER. */
export function sumCents(amounts: Iterable<bigint>): bigint {
  let total = ZERO
  for (const amount of amounts) total += amount
  return total
}

/** Los límites JSON usan strings decimales, incluidos los totales grandes. */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < ZERO
  const absolute = negative ? -cents : cents
  return `${negative ? '-' : ''}${absolute / HUNDRED}.${String(absolute % HUNDRED).padStart(2, '0')}`
}

export function formatFinancialAmount(value: string): string {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('Importe financiero inválido')
  const negative = value.startsWith('-')
  const [integer, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const sign = negative && (BigInt(integer) !== ZERO || BigInt(fraction || '0') !== ZERO) ? '-' : ''
  return `$ ${sign}${new Intl.NumberFormat('es-AR').format(BigInt(integer))},${fraction.padEnd(2, '0')}`
}

/** Los agregados pueden superar el límite de cada importe individual. */
export function parseAggregateCents(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Importe financiero inválido')
  const [integer, fraction = ''] = value.split('.')
  return BigInt(integer) * HUNDRED + BigInt(fraction.padEnd(2, '0'))
}
