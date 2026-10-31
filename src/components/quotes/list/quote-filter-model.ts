import { STATUSES_FILTER, type FiltersList } from '@/lib/quotes/list'

export type ClientFilter = { id: string; razon_social: string }
export type DateRange = { from: string; to: string }
export type MobileQuoteFilters = Pick<FiltersList, 'estado' | 'cliente' | 'desde' | 'hasta'>

export function readFilterStatus(value: string): FiltersList['estado'] {
  return STATUSES_FILTER.find((state) => state === value) ?? ''
}

export function isInvalidDateRange({ from, to }: DateRange) {
  return from !== '' && to !== '' && from > to
}
