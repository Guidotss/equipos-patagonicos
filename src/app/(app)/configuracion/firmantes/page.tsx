import type { Metadata } from 'next'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { Signers, NewSigner } from '@/components/settings/signers'
import { ButtonStatus } from '@/components/form/button-status'
import { createClient } from '@/lib/supabase/server'
import { changeStatusSigner } from '../actions'

export const metadata: Metadata = { title: 'Firmantes' }

export default async function SignersPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, email, activo')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw error

  const firmantes = data.map((firmante) => ({
    ...firmante,
    button: (
      <ButtonStatus
        activo={firmante.activo}
        label={firmante.nombre}
        accion={changeStatusSigner.bind(null, firmante.id, !firmante.activo)}
      />
    ),
  }))

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Firmantes' }]} />
      <Content>
        <HeaderPage
          titulo="Firmantes"
          descripcion="Nombre, cargo y teléfono que aparecen al pie de cada cotización."
          actions={<NewSigner />}
        />
        <Signers firmantes={firmantes} />
      </Content>
    </>
  )
}
