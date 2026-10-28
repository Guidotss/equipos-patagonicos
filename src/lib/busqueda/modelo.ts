import { z } from 'zod'

export const GRUPOS_BUSQUEDA = {
  clientes: 'Clientes',
  cotizaciones: 'Cotizaciones',
  orden_compra: 'Órdenes de compra',
  remito: 'Remitos',
  factura: 'Facturas',
  orden_pago: 'Órdenes de pago',
} as const

export type GrupoBusqueda = keyof typeof GRUPOS_BUSQUEDA

export const esquemaBusqueda = z.string().max(200, 'La búsqueda admite hasta 200 caracteres.').trim()

export function esGrupoBusqueda(valor: unknown): valor is GrupoBusqueda {
  return typeof valor === 'string' && Object.hasOwn(GRUPOS_BUSQUEDA, valor)
}

export function hrefBusqueda(q: string, grupo?: GrupoBusqueda, pagina = 1): string {
  const parametros = new URLSearchParams({ q })
  if (grupo) parametros.set('grupo', grupo)
  if (pagina > 1) parametros.set('pagina', String(pagina))
  return `/buscar?${parametros}`
}
