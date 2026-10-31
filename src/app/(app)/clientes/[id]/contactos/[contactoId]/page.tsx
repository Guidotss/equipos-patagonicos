import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { ContactForm } from '@/components/clients/contact-form'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { actualizarContact, removeContact } from '../../../actions'

export const metadata: Metadata = { title: 'Contacto' }

export default async function ContactPage({ params }: { params: Promise<{ id: string; contactoId: string }> }) {
  const { id, contactoId: contactId } = await params
  if (!isUuid(id) || !isUuid(contactId)) notFound()

  const supabase = await createClient()
  const { data: contacto, error } = await supabase
    .from('contactos')
    .select('nombre, cargo, email, telefono, clientes(razon_social)')
    .eq('id', contactId)
    .eq('cliente_id', id)
    .maybeSingle()
  if (error) throw error
  if (!contacto) notFound()

  const { clientes: cliente, ...initial } = contacto

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Clientes', href: '/clientes' },
          { texto: cliente.razon_social, href: `/clientes/${id}` },
          { texto: contacto.nombre },
        ]}
      />
      <ContactForm
        accion={actualizarContact.bind(null, id, contactId)}
        borrar={removeContact.bind(null, id, contactId)}
        clientId={id}
        razonSocial={cliente.razon_social}
        initial={initial}
      />
    </>
  )
}
