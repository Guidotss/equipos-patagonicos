import type { Metadata } from 'next'
import { BarCrumbs } from '@/components/app-shell/header'
import { SignerForm } from '@/components/settings/signers'
import { crearSigner } from '../../actions'

export const metadata: Metadata = { title: 'Nuevo firmante' }

export default function NewSignerPage() {
  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Firmantes', href: '/configuracion/firmantes' },
          { texto: 'Nuevo firmante' },
        ]}
      />
      <SignerForm accion={crearSigner} />
    </>
  )
}
