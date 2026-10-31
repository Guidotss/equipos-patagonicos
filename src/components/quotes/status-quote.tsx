import { Pastilla, type TonoPastilla } from '@/components/ui/pastilla'
import { estadoVisible, type EstadoVisible } from '@/lib/cotizaciones/lista'

/** Etiqueta y tono de cada estado que ve el usuario (la pastilla y el filtro de la lista usan las mismas). */
export const ESTADOS_COTIZACION: Record<EstadoVisible, { etiqueta: string; tono: TonoPastilla }> = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  enviada: { etiqueta: 'Enviada', tono: 'info' },
  vencida: { etiqueta: 'Vencida', tono: 'aviso' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' },
}

/**
 * Pastilla de estado de una cotización: lista, encabezado del editor y, más adelante, la ficha de cliente.
 * `vencida` es la columna de v_cotizaciones; sin ella (una cotización nueva) nunca se muestra "Vencida".
 */
export function EstadoCotizacion({ estado, vencida = null }: { estado: string; vencida?: boolean | null }) {
  const { etiqueta, tono } = ESTADOS_COTIZACION[estadoVisible(estado, vencida)]
  return <Pastilla tono={tono}>{etiqueta}</Pastilla>
}
