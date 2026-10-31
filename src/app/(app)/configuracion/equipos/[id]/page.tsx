import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { FormEquipment } from '@/components/settings/equipment'
import { ButtonStatus } from '@/components/form/button-status'
import { capacityText, VARIABLES_EQUIPMENT } from '@/lib/catalogs/equipment'
import { phrasesWithVariables } from '@/lib/templates/phrases'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { actualizarEquipment, changeStatusEquipment } from '../../actions'

export const metadata: Metadata = { title: 'Equipo' }

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const [{ data: equipo, error }, { data: plantillas, error: errorTemplates }] = await Promise.all([
    supabase
      .from('equipos')
      .select('id, nombre, capacidad_tn, marca, modelo, identificacion, descripcion, activo')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('plantillas').select('bloques').eq('activa', true),
  ])
  if (error) throw error
  if (errorTemplates) throw errorTemplates
  if (!equipo) notFound()

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Equipos', href: '/configuracion/equipos' },
          { texto: equipo.nombre },
        ]}
      />
      <FormEquipment
        accion={actualizarEquipment.bind(null, id)}
        equipo={{ ...equipo, capacidad_tn: capacityText(equipo.capacidad_tn) }}
        buttonStatus={
          <ButtonStatus
            grande
            activo={equipo.activo}
            label={equipo.nombre}
            accion={changeStatusEquipment.bind(null, id, !equipo.activo)}
          />
        }
        phrases={phrasesWithVariables(plantillas, VARIABLES_EQUIPMENT)}
      />
    </>
  )
}
