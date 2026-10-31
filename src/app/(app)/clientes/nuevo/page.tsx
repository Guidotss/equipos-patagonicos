import type { Metadata } from 'next'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { HeaderForm } from '@/components/form/structure-form'
import { ClientForm } from '@/components/clients/client-form'
import { crearClient } from '../actions'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NewClientPage() {
  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Clientes', href: '/clientes' }, { texto: 'Nuevo cliente' }]} />
      <Content className="max-w-6xl pb-28">
        <HeaderForm titulo="Nuevo cliente" descripcion="Los contactos se agregan desde la ficha, después de crearlo." />
          <ClientForm accion={crearClient} textButton="Crear cliente" />
      </Content>
    </>
  )
}
