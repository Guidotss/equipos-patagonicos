import { daysBetween } from '@/lib/format/dates'

export const QUEUES_HOME = {
  seguimiento: {
    titulo: 'Seguimiento',
    descripcion: 'Cotizaciones sin respuesta hace más de 5 días o que vencen en los próximos 7.',
    empty: 'No hay cotizaciones pendientes de seguimiento.',
    enlaceEmpty: '/cotizaciones',
    actionEmpty: 'Ver cotizaciones',
  },
  falta_oc: {
    titulo: 'Falta OC',
    descripcion: 'Presupuestos en curso que todavía no tienen una orden de compra activa.',
    empty: 'Todos los presupuestos en curso tienen su orden de compra.',
    enlaceEmpty: '/presupuestos',
    actionEmpty: 'Ver presupuestos',
  },
  para_facturar: {
    titulo: 'Para facturar',
    descripcion: 'Remitos que todavía no tienen una factura activa.',
    empty: 'No hay remitos pendientes de facturación.',
    enlaceEmpty: '/documentos/nuevo',
    actionEmpty: 'Subir documento',
  },
  cobranzas: {
    titulo: 'Cobranzas',
    descripcion: 'Facturas con saldo pendiente, por antigüedad.',
    empty: 'No hay facturas con saldo pendiente de cobro.',
    enlaceEmpty: '/presupuestos',
    actionEmpty: 'Ver presupuestos',
  },
  actualizacion: {
    titulo: 'Actualización de tarifa',
    descripcion: 'Presupuestos en curso con actualización vencida o en los próximos 30 días.',
    empty: 'No hay actualizaciones previstas para los próximos 30 días.',
    enlaceEmpty: '/presupuestos',
    actionEmpty: 'Ver presupuestos',
  },
} as const

export type QueueHome = keyof typeof QUEUES_HOME

export function isQueueHome(value: unknown): value is QueueHome {
  return typeof value === 'string' && Object.hasOwn(QUEUES_HOME, value)
}

export function pageValid(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,7}$/.test(value)) return 1
  return Math.max(1, Number(value))
}

export function vencimientoPending(fecha: string, today: string) {
  const dias = daysBetween(today, fecha)
  if (dias < 0) return { texto: `Venció hace ${-dias} d`, tone: 'peligro' as const }
  if (dias === 0) return { texto: 'Vence hoy', tone: 'peligro' as const }
  if (dias === 1) return { texto: 'Vence mañana', tone: 'aviso' as const }
  return { texto: `Vence en ${dias} d`, tone: dias <= 7 ? 'aviso' as const : 'neutro' as const }
}

export function antiguedadCobranza(dias: number) {
  if (dias >= 60) return { texto: '60+ días', tone: 'peligro' as const }
  if (dias >= 45) return { texto: '45+ días', tone: 'aviso' as const }
  if (dias >= 30) return { texto: '30+ días', tone: 'aviso' as const }
  return { texto: `${Math.max(dias, 0)} días`, tone: 'neutro' as const }
}
