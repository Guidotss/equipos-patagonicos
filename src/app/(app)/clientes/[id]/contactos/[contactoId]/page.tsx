import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { ContactoForm } from '@/components/clientes/contacto-form'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarContacto, borrarContacto } from '../../../actions'

export const metadata: Metadata = { title: 'Contacto' }

export default async function ContactoPage({ params }: { params: Promise<{ id: string; contactoId: string }> }) {
  const { id, contactoId } = await params
  if (!esUuid(id) || !esUuid(contactoId)) notFound()

  const supabase = await createClient()
  const { data: contacto, error } = await supabase
    .from('contactos')
    .select('nombre, cargo, email, telefono, clientes(razon_social)')
    .eq('id', contactoId)
    .eq('cliente_id', id)
    .maybeSingle()
  if (error) throw error
  if (!contacto) notFound()

  const { clientes: cliente, ...inicial } = contacto

  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Clientes', href: '/clientes' },
          { texto: cliente.razon_social, href: `/clientes/${id}` },
          { texto: contacto.nombre },
        ]}
      />
      <ContactoForm
        accion={actualizarContacto.bind(null, id, contactoId)}
        borrar={borrarContacto.bind(null, id, contactoId)}
        clienteId={id}
        razonSocial={cliente.razon_social}
        inicial={inicial}
      />
    </>
  )
}
