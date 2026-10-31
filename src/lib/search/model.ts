import { z } from 'zod'

export const GROUPS_SEARCH = {
  clientes: 'Clientes',
  cotizaciones: 'Cotizaciones',
  orden_compra: 'Órdenes de compra',
  remito: 'Remitos',
  factura: 'Facturas',
  orden_pago: 'Órdenes de pago',
} as const

export type GroupSearch = keyof typeof GROUPS_SEARCH

export const schemaSearch = z.string().max(200, 'La búsqueda admite hasta 200 caracteres.').trim()

export function isGroupSearch(value: unknown): value is GroupSearch {
  return typeof value === 'string' && Object.hasOwn(GROUPS_SEARCH, value)
}

export function hrefSearch(q: string, grupo?: GroupSearch, pagina = 1): string {
  const params = new URLSearchParams({ q })
  if (grupo) params.set('grupo', grupo)
  if (pagina > 1) params.set('pagina', String(pagina))
  return `/buscar?${params}`
}
