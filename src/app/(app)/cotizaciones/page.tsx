import type { Metadata } from 'next'
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export const metadata: Metadata = { title: 'Cotizaciones' }

export default function CotizacionesPage() {
  return <SeccionPendiente titulo="Cotizaciones" descripcion="Crear, enviar y aprobar cotizaciones." />
}
