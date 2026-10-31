import { Pill, type TonePill } from '@/components/ui/pill'
import { statusVisible, type StatusVisible } from '@/lib/quotes/list'

/** Etiqueta y tono de cada estado que ve el usuario (la pastilla y el filtro de la lista usan las mismas). */
export const STATUSES_QUOTE: Record<StatusVisible, { label: string; tone: TonePill }> = {
  borrador: { label: 'Borrador', tone: 'neutro' },
  enviada: { label: 'Enviada', tone: 'info' },
  vencida: { label: 'Vencida', tone: 'aviso' },
  aprobada: { label: 'Aprobada', tone: 'exito' },
  rechazada: { label: 'Rechazada', tone: 'peligro' },
}

/**
 * Pastilla de estado de una cotización: lista, encabezado del editor y, más adelante, la ficha de cliente.
 * `vencida` es la columna de v_cotizaciones; sin ella (una cotización nueva) nunca se muestra "Vencida".
 */
export function StatusQuote({ estado, vencida = null }: { estado: string; vencida?: boolean | null }) {
  const { label, tone } = STATUSES_QUOTE[statusVisible(estado, vencida)]
  return <Pill tone={tone}>{label}</Pill>
}
