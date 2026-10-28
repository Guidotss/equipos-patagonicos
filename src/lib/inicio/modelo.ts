import { diasEntre } from '@/lib/format/fechas'

export const COLAS_INICIO = {
  seguimiento: {
    titulo: 'Seguimiento',
    descripcion: 'Cotizaciones sin respuesta hace más de 5 días o que vencen en los próximos 7.',
    vacio: 'No hay cotizaciones pendientes de seguimiento.',
    enlaceVacio: '/cotizaciones',
    accionVacio: 'Ver cotizaciones',
  },
  falta_oc: {
    titulo: 'Falta OC',
    descripcion: 'Presupuestos en curso que todavía no tienen una orden de compra activa.',
    vacio: 'Todos los presupuestos en curso tienen su orden de compra.',
    enlaceVacio: '/presupuestos',
    accionVacio: 'Ver presupuestos',
  },
  para_facturar: {
    titulo: 'Para facturar',
    descripcion: 'Remitos que todavía no tienen una factura activa.',
    vacio: 'No hay remitos pendientes de facturación.',
    enlaceVacio: '/documentos/nuevo',
    accionVacio: 'Subir documento',
  },
  cobranzas: {
    titulo: 'Cobranzas',
    descripcion: 'Facturas con saldo pendiente, por antigüedad.',
    vacio: 'No hay facturas con saldo pendiente de cobro.',
    enlaceVacio: '/presupuestos',
    accionVacio: 'Ver presupuestos',
  },
  actualizacion: {
    titulo: 'Actualización de tarifa',
    descripcion: 'Presupuestos en curso con actualización vencida o en los próximos 30 días.',
    vacio: 'No hay actualizaciones previstas para los próximos 30 días.',
    enlaceVacio: '/presupuestos',
    accionVacio: 'Ver presupuestos',
  },
} as const

export type ColaInicio = keyof typeof COLAS_INICIO

export function esColaInicio(valor: unknown): valor is ColaInicio {
  return typeof valor === 'string' && Object.hasOwn(COLAS_INICIO, valor)
}

export function paginaValida(valor: unknown): number {
  if (typeof valor !== 'string' || !/^\d{1,7}$/.test(valor)) return 1
  return Math.max(1, Number(valor))
}

export function vencimientoPendiente(fecha: string, hoy: string) {
  const dias = diasEntre(hoy, fecha)
  if (dias < 0) return { texto: `Venció hace ${-dias} d`, tono: 'peligro' as const }
  if (dias === 0) return { texto: 'Vence hoy', tono: 'peligro' as const }
  if (dias === 1) return { texto: 'Vence mañana', tono: 'aviso' as const }
  return { texto: `Vence en ${dias} d`, tono: dias <= 7 ? 'aviso' as const : 'neutro' as const }
}

export function antiguedadCobranza(dias: number) {
  if (dias >= 60) return { texto: '60+ días', tono: 'peligro' as const }
  if (dias >= 45) return { texto: '45+ días', tono: 'aviso' as const }
  if (dias >= 30) return { texto: '30+ días', tono: 'aviso' as const }
  return { texto: `${Math.max(dias, 0)} días`, tono: 'neutro' as const }
}
