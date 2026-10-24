import type { Metadata } from 'next'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { crearCliente } from '../actions'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NuevoClientePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      <ClienteForm accion={crearCliente} textoBoton="Crear cliente" />
    </section>
  )
}
