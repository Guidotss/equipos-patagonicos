// src/lib/cotizaciones/lista-vista.ts
// Lo que dibujan la tabla y la lista del celular a partir de una fila de buscar_cotizaciones, más la paginación y
// el filtro de fechas. Puro: se prueba con Vitest.
import { formatFechaCorta, sumarDias } from '@/lib/format/fechas'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { estadoVisible, POR_PAGINA, resumenCotizacion } from './lista'

/** Una fila de buscar_cotizaciones con las columnas que pide la lista (src/app/(app)/cotizaciones/page.tsx). */
export type FilaVistaLista = {
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
export type FilaCotizacion = {
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

export function filaCotizacion(fila: FilaVistaLista): FilaCotizacion {
  const visible = estadoVisible(fila.estado, fila.vencida)
  const conVencimiento = visible === 'enviada' || visible === 'vencida'
  return {
    id: fila.id,
    numero: fila.numero,
    origen: fila.origen === 'importada' ? 'Cargada' : fila.origen === 'directa' ? 'Directa' : null,
    fecha: formatFechaCorta(fila.fecha),
    cliente: fila.cliente_razon_social,
    trabajo: resumenCotizacion(fila),
    formato: fila.origen === 'app' ? (FORMATOS[fila.formato as Formato] ?? fila.formato) : '—',
    estado: fila.estado,
    vencida: fila.vencida === true,
    venceEl: conVencimiento && fila.vence_el ? formatFechaCorta(fila.vence_el) : null,
    tienePdf: fila.origen !== 'directa',
  }
}

/** Cantidad de páginas de la lista (al menos una). */
export function totalPaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA))
}

/** Primera y última posición de una página, para "Mostrando 26–29 de 29". */
export function filasMostradas(pagina: number, total: number): { desde: number; hasta: number } {
  if (total === 0) return { desde: 0, hasta: 0 }
  return { desde: (pagina - 1) * POR_PAGINA + 1, hasta: Math.min(pagina * POR_PAGINA, total) }
}

export type AtajoFechas = { etiqueta: string; desde: string; hasta: string }

function primerDia(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function ultimoDia(iso: string): string {
  // 31 días después del día 1 siempre cae en el mes siguiente; el día anterior a su día 1 es el último de este.
  return sumarDias(primerDia(sumarDias(primerDia(iso), 31)), -1)
}

/** Rangos de un clic del filtro de fechas. `hoy` es la fecha argentina (hoyArgentina). */
export function atajosFechas(hoy: string): AtajoFechas[] {
  const finMesAnterior = sumarDias(primerDia(hoy), -1)
  return [
    { etiqueta: 'Este mes', desde: primerDia(hoy), hasta: ultimoDia(hoy) },
    { etiqueta: 'Mes anterior', desde: primerDia(finMesAnterior), hasta: finMesAnterior },
    { etiqueta: 'Últimos 90 días', desde: sumarDias(hoy, -89), hasta: hoy },
  ]
}

/** Texto del botón de fechas: "01/10/2026 – 31/10/2026", "Desde 01/10/2026", "Hasta …" o "Cualquier fecha". */
export function textoRangoFechas(desde: string, hasta: string): string {
  if (desde && hasta) return `${formatFechaCorta(desde)} – ${formatFechaCorta(hasta)}`
  if (desde) return `Desde ${formatFechaCorta(desde)}`
  if (hasta) return `Hasta ${formatFechaCorta(hasta)}`
  return 'Cualquier fecha'
}
