const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

const MS_BY_DAY = 86_400_000

function partes(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // Date.UTC corre en silencio las fechas imposibles (30/02 -> 02/03) y pasa los
  // años 0-99 a 1900+año; si no vuelve igual, la fecha no existe.
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Fecha inválida: ${iso}`)
  }
  return { year, month, day }
}

function aUtc(iso: string): number {
  const { year, month, day } = partes(iso)
  return Date.UTC(year, month - 1, day)
}

/** "22 de octubre de 2026" */
export function dateInLetters(iso: string): string {
  const { year, month, day } = partes(iso)
  return `${day} de ${MESES[month - 1]} de ${year}`
}

/** true si es una fecha 'YYYY-MM-DD' que existe (la misma regla que usan las funciones de este archivo). */
export function isDate(iso: string): boolean {
  try {
    partes(iso)
    return true
  } catch {
    return false
  }
}

// 'YYYY-MM' como lo devuelve <input type="month">. El año arranca en 1000 por la misma razón que en `partes`.
const PATRON_MONTH = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/

/** true si es un mes 'YYYY-MM' válido. */
export function isMonth(month: string): boolean {
  return PATRON_MONTH.test(month)
}

/** "2026-11" → "noviembre de 2026" (como se escribe la próxima actualización en el PDF); "" → "". */
export function monthInLetters(month: string): string {
  if (month === '') return ''
  const m = PATRON_MONTH.exec(month)
  if (!m) throw new Error(`Mes inválido: ${month}`)
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`
}

/** "Neuquén, 22 de octubre de 2026." */
export function headerDate(ciudad: string, iso: string): string {
  return `${ciudad}, ${dateInLetters(iso)}.`
}

/** "24/07/2026" */
export function formatDateCorta(iso: string): string {
  const { year, month, day } = partes(iso)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/** Fecha de hoy (YYYY-MM-DD) en hora argentina, sin importar la zona del servidor. */
export function todayArgentina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function sumarDays(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * MS_BY_DAY).toISOString().slice(0, 10)
}

export function daysBetween(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_BY_DAY)
}
