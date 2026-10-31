import { STATUSES_FILTER, type FiltersList } from '@/lib/quotes/list'

export type ClientFilter = { id: string; razon_social: string }
export type DateRange = { desde: string; hasta: string }
export type MobileQuoteFilters = Pick<FiltersList, 'estado' | 'cliente' | 'desde' | 'hasta'>

export function readFilterStatus(value: string): FiltersList['estado'] {
  return STATUSES_FILTER.find((estado) => estado === value) ?? ''
}

export function isInvalidDateRange({ desde, hasta }: DateRange) {
  return desde !== '' && hasta !== '' && desde > hasta
}
