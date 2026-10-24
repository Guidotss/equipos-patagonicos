import type { Metadata } from 'next'
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export const metadata: Metadata = { title: 'Configuración' }

export default function ConfiguracionPage() {
  return (
    <SeccionPendiente
      titulo="Configuración"
      descripcion="Datos de la empresa, firmantes, equipos y plantillas."
    />
  )
}
