// src/lib/cotizaciones/lista-vista.ts
// Lo que dibujan la tabla y la lista del celular a partir de una fila de buscar_cotizaciones, más la paginación y
// el filtro de fechas. Puro: se prueba con Vitest.
import { formatDateCorta, sumarDays } from '@/lib/format/dates'
import { FORMATOS, type Format } from '@/lib/templates/content'
import { statusVisible, PER_PAGE, resumenQuote } from './list'

/** Una fila de buscar_cotizaciones con las columnas que pide la lista (src/app/(app)/cotizaciones/page.tsx). */
export type RowViewList = {
  id: string
  numero: number
  origen: string
  fecha: string
  cliente_razon_social: string
  formato: string
  estado: string
  vencida: boolean | null
  vence_el: string | null
  asunto: string
  datos: unknown
  equipo: { nombre: string } | null
}

/** Lo que dibujan la tabla y la lista del celular: textos ya armados y ningún monto (diseño §5). */
export type RowQuote = {
  id: string
  numero: number
  /** Solo en las que no se hicieron en la app. */
  origen: 'Cargada' | 'Directa' | null
  /** "20/10/2026" */
  fecha: string
  cliente: string
  /** Equipo y ubicación, o el asunto resumido (resumenCotizacion). */
  trabajo: string
  /** "Mensual" o "Por jornada"; "—" en una cargada o una directa (su formato no significa nada). */
  formato: string
  /** El guardado; con `vencida` arma la pastilla (EstadoCotizacion). */
  estado: string
  vencida: boolean
  /** "19/11/2026" solo en las enviadas, al día o vencidas; null en el resto (decisión 2). */
  venceEl: string | null
  /** Un presupuesto directo no tiene PDF (la ruta responde 404). */
  tienePdf: boolean
}

export function rowQuote(row: RowViewList): RowQuote {
  const visible = statusVisible(row.estado, row.vencida)
  const withVencimiento = visible === 'enviada' || visible === 'vencida'
  return {
    id: row.id,
    numero: row.numero,
    origen: row.origen === 'importada' ? 'Cargada' : row.origen === 'directa' ? 'Directa' : null,
    fecha: formatDateCorta(row.fecha),
    cliente: row.cliente_razon_social,
    trabajo: resumenQuote(row),
    formato: row.origen === 'app' ? (FORMATOS[row.formato as Format] ?? row.formato) : '—',
    estado: row.estado,
    vencida: row.vencida === true,
    venceEl: withVencimiento && row.vence_el ? formatDateCorta(row.vence_el) : null,
    tienePdf: row.origen !== 'directa',
  }
}

/** Cantidad de páginas de la lista (al menos una). */
export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PER_PAGE))
}

/** Primera y última posición de una página, para "Mostrando 26–29 de 29". */
export function rowsMostradas(pagina: number, total: number): { desde: number; hasta: number } {
  if (total === 0) return { desde: 0, hasta: 0 }
  return { desde: (pagina - 1) * PER_PAGE + 1, hasta: Math.min(pagina * PER_PAGE, total) }
}

export type AtajoDates = { label: string; desde: string; hasta: string }

function primerDay(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function lastDay(iso: string): string {
  // 31 días después del día 1 siempre cae en el mes siguiente; el día anterior a su día 1 es el último de este.
  return sumarDays(primerDay(sumarDays(primerDay(iso), 31)), -1)
}

/** Rangos de un clic del filtro de fechas. `hoy` es la fecha argentina (hoyArgentina). */
export function atajosDates(today: string): AtajoDates[] {
  const finMonthPrevious = sumarDays(primerDay(today), -1)
  return [
    { label: 'Este mes', desde: primerDay(today), hasta: lastDay(today) },
    { label: 'Mes anterior', desde: primerDay(finMonthPrevious), hasta: finMonthPrevious },
    { label: 'Últimos 90 días', desde: sumarDays(today, -89), hasta: today },
  ]
}

/** Texto del botón de fechas: "01/10/2026 – 31/10/2026", "Desde 01/10/2026", "Hasta …" o "Cualquier fecha". */
export function textRangoDates(desde: string, hasta: string): string {
  if (desde && hasta) return `${formatDateCorta(desde)} – ${formatDateCorta(hasta)}`
  if (desde) return `Desde ${formatDateCorta(desde)}`
  if (hasta) return `Hasta ${formatDateCorta(hasta)}`
  return 'Cualquier fecha'
}
