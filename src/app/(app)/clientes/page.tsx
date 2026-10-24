import type { Metadata } from 'next'
import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'

export const metadata: Metadata = { title: 'Clientes' }

export default function ClientesPage() {
  return <SeccionPendiente titulo="Clientes" descripcion="Clientes y contactos." />
}
