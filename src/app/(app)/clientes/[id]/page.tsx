import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs, Content, HeaderFicha } from '@/components/app-shell/header'
import { ClientForm } from '@/components/clients/client-form'
import { Contacts } from '@/components/clients/contacts'
import { HistoryCommercial } from '@/components/clients/history-commercial'
import { ButtonStatus } from '@/components/form/button-status'
import { Pill } from '@/components/ui/pill'
import { CONDICIONES_IVA } from '@/lib/clients/schemas'
import { formatCuit } from '@/lib/cuit'
import { iniciales } from '@/lib/format/text'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { actualizarClient, changeStatusClient } from '../actions'

export const metadata: Metadata = { title: 'Cliente' }

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*, contactos(id, nombre, cargo, email, telefono)')
    .eq('id', id)
    .order('nombre', { referencedTable: 'contactos' })
    .maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  const dataKey = [
    cliente.cuit ? `CUIT ${formatCuit(cliente.cuit)}` : null,
    CONDICIONES_IVA[cliente.condicion_iva as keyof typeof CONDICIONES_IVA] ?? null,
    [cliente.localidad, cliente.provincia].filter(Boolean).join(', ') || null,
  ].filter(Boolean)

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Clientes', href: '/clientes' }, { texto: cliente.razon_social }]} />
      <HeaderFicha
        titulo={cliente.razon_social}
        recuadro={iniciales(cliente.razon_social, 1)}
        estado={cliente.activo ? <Pill tone="exito">Activo</Pill> : <Pill>Inactivo</Pill>}
        datos={dataKey.length > 0 ? dataKey.join(' • ') : null}
        actions={
          <ButtonStatus
            activo={cliente.activo}
            label={cliente.razon_social}
            accion={changeStatusClient.bind(null, id, !cliente.activo)}
          />
        }
      />

      <Content className="grid max-w-6xl items-start gap-6 space-y-0 pb-28 lg:grid-cols-2">
        <section aria-label="Datos del cliente" className="min-w-0 lg:col-span-2">
          <ClientForm
            accion={actualizarClient.bind(null, id)}
            initial={{ ...cliente, cuit: cliente.cuit ? formatCuit(cliente.cuit) : '' }}
            textButton="Guardar cambios"
          />
        </section>

        <Contacts clientId={id} contactos={cliente.contactos} />
        <section className="min-w-0"><HistoryCommercial clientId={id} /></section>
      </Content>
    </>
  )
}
