import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { ContactForm } from '@/components/clients/contact-form'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { crearContact } from '../../../actions'

export const metadata: Metadata = { title: 'Nuevo contacto' }

export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase.from('clientes').select('razon_social').eq('id', id).maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Clientes', href: '/clientes' },
          { texto: cliente.razon_social, href: `/clientes/${id}` },
          { texto: 'Nuevo contacto' },
        ]}
      />
      <ContactForm accion={crearContact.bind(null, id)} clientId={id} razonSocial={cliente.razon_social} />
    </>
  )
}
