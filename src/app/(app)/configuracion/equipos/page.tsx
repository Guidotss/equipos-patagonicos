import type { Metadata } from 'next'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { Equipment, NewEquipment } from '@/components/settings/equipment'
import { ButtonStatus } from '@/components/form/button-status'
import { capacityText } from '@/lib/catalogs/equipment'
import { createClient } from '@/lib/supabase/server'
import { changeStatusEquipment } from '../actions'

export const metadata: Metadata = { title: 'Equipos' }

export default async function EquipmentPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, marca, modelo, identificacion, descripcion, activo')
    .order('activo', { ascending: false })
    .order('capacidad_tn', { ascending: false, nullsFirst: false })
  if (error) throw error

  const equipos = data.map((equipo) => ({
    ...equipo,
    capacidad_tn: capacityText(equipo.capacidad_tn),
    button: (
      <ButtonStatus
        activo={equipo.activo}
        label={equipo.nombre}
        accion={changeStatusEquipment.bind(null, equipo.id, !equipo.activo)}
      />
    ),
  }))

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Equipos' }]} />
      <Content>
        <HeaderPage
          titulo="Equipos"
          descripcion="La descripción de cada equipo se usa como “Equipo ofrecido” en las cotizaciones."
          actions={<NewEquipment />}
        />
        <Equipment equipos={equipos} />
      </Content>
    </>
  )
}
