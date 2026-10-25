import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { FirmanteForm } from '@/components/configuracion/firmantes'
import { crearFirmante } from '../../actions'

export const metadata: Metadata = { title: 'Nuevo firmante' }

export default function NuevoFirmantePage() {
  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Firmantes', href: '/configuracion/firmantes' },
          { texto: 'Nuevo firmante' },
        ]}
      />
      <FirmanteForm accion={crearFirmante} />
    </>
  )
}
