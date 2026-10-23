const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'

const MS_POR_DIA = 86_400_000

function partes(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) throw new Error(`Fecha inválida: ${iso}`)
  return { anio, mes, dia }
}

function aUtc(iso: string): number {
  const { anio, mes, dia } = partes(iso)
  return Date.UTC(anio, mes - 1, dia)
}

/** "22 de octubre de 2026" */
export function fechaEnLetras(iso: string): string {
  const { anio, mes, dia } = partes(iso)
  return `${dia} de ${MESES[mes - 1]} de ${anio}`
}

/** "Neuquén, 22 de octubre de 2026." */
export function encabezadoFecha(ciudad: string, iso: string): string {
  return `${ciudad}, ${fechaEnLetras(iso)}.`
}

/** "24/07/2026" */
export function formatFechaCorta(iso: string): string {
  const { anio, mes, dia } = partes(iso)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`
}

/** Fecha de hoy (YYYY-MM-DD) en hora argentina, sin importar la zona del servidor. */
export function hoyArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * MS_POR_DIA).toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA)
}
