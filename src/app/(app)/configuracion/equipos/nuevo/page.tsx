import type { Metadata } from 'next'
import { BarCrumbs } from '@/components/app-shell/header'
import { FormEquipment } from '@/components/settings/equipment'
import { VARIABLES_EQUIPMENT } from '@/lib/catalogs/equipment'
import { phrasesWithVariables } from '@/lib/templates/phrases'
import { createClient } from '@/lib/supabase/server'
import { crearEquipment } from '../../actions'

export const metadata: Metadata = { title: 'Nuevo equipo' }

export default async function NewEquipmentPage() {
  const supabase = await createClient()
  const { data: plantillas, error } = await supabase.from('plantillas').select('bloques').eq('activa', true)
  if (error) throw error

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Equipos', href: '/configuracion/equipos' },
          { texto: 'Nuevo equipo' },
        ]}
      />
      <FormEquipment accion={crearEquipment} phrases={phrasesWithVariables(plantillas, VARIABLES_EQUIPMENT)} />
    </>
  )
}
