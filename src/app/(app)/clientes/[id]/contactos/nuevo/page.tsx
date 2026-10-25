import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { ContactoForm } from '@/components/clientes/contacto-form'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { crearContacto } from '../../../actions'

export const metadata: Metadata = { title: 'Nuevo contacto' }

export default async function NuevoContactoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase.from('clientes').select('razon_social').eq('id', id).maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Clientes', href: '/clientes' },
          { texto: cliente.razon_social, href: `/clientes/${id}` },
          { texto: 'Nuevo contacto' },
        ]}
      />
      <ContactoForm accion={crearContacto.bind(null, id)} clienteId={id} razonSocial={cliente.razon_social} />
    </>
  )
}
