import type { Metadata } from 'next'
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export const metadata: Metadata = { title: 'Presupuestos' }

export default function PresupuestosPage() {
  return (
    <SeccionPendiente
      titulo="Presupuestos"
      descripcion="Cotizaciones aprobadas con sus órdenes de compra, remitos, facturas y órdenes de pago."
    />
  )
}
