import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { SignerForm } from '@/components/settings/signers'
import { ButtonStatus } from '@/components/form/button-status'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { actualizarSigner, changeStatusSigner } from '../../actions'

export const metadata: Metadata = { title: 'Firmante' }

export default async function SignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: firmante, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, email, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!firmante) notFound()

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Firmantes', href: '/configuracion/firmantes' },
          { texto: firmante.nombre },
        ]}
      />
      <SignerForm
        accion={actualizarSigner.bind(null, id)}
        initial={firmante}
        buttonStatus={
          <ButtonStatus
            grande
            activo={firmante.activo}
            label={firmante.nombre}
            accion={changeStatusSigner.bind(null, id, !firmante.activo)}
          />
        }
      />
    </>
  )
}
