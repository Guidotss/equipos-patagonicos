import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { FirmanteForm } from '@/components/configuracion/firmantes'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarFirmante, cambiarEstadoFirmante } from '../../actions'

export const metadata: Metadata = { title: 'Firmante' }

export default async function FirmantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

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
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Firmantes', href: '/configuracion/firmantes' },
          { texto: firmante.nombre },
        ]}
      />
      <FirmanteForm
        accion={actualizarFirmante.bind(null, id)}
        inicial={firmante}
        botonEstado={
          <BotonEstado
            grande
            activo={firmante.activo}
            etiqueta={firmante.nombre}
            accion={cambiarEstadoFirmante.bind(null, id, !firmante.activo)}
          />
        }
      />
    </>
  )
}
