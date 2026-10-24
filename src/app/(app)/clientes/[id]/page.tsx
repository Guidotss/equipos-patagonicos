import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { Contactos } from '@/components/clientes/contactos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { Badge } from '@/components/ui/badge'
import { formatCuit } from '@/lib/cuit'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarCliente, actualizarContacto, borrarContacto, cambiarEstadoCliente, crearContacto } from '../actions'

export const metadata: Metadata = { title: 'Cliente' }

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*, contactos(id, nombre, cargo, email, telefono)')
    .eq('id', id)
    .order('nombre', { referencedTable: 'contactos' })
    .maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  const contactos = cliente.contactos.map((contacto) => ({
    ...contacto,
    actualizar: actualizarContacto.bind(null, id, contacto.id),
    borrar: borrarContacto.bind(null, id, contacto.id),
  }))

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{cliente.razon_social}</h1>
          {cliente.activo ? null : <Badge variant="secondary">Inactivo</Badge>}
        </div>
        <BotonEstado
          activo={cliente.activo}
          etiqueta={cliente.razon_social}
          accion={cambiarEstadoCliente.bind(null, id, !cliente.activo)}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Datos</h2>
        <ClienteForm
          accion={actualizarCliente.bind(null, id)}
          inicial={{ ...cliente, cuit: cliente.cuit ? formatCuit(cliente.cuit) : '' }}
          textoBoton="Guardar cambios"
        />
      </section>

      <Contactos contactos={contactos} crear={crearContacto.bind(null, id)} />
    </section>
  )
}
