import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { PlantillaForm } from '@/components/configuracion/plantilla-form'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { FORMATOS, leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { cambiarEstadoPlantilla, renombrarPlantilla } from '../../actions'

export const metadata: Metadata = { title: 'Plantilla' }

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: plantilla, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!plantilla) notFound()

  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Plantillas', href: '/configuracion/plantillas' },
          { texto: plantilla.nombre },
        ]}
      />
      <PlantillaForm
        accion={renombrarPlantilla.bind(null, id)}
        plantilla={{
          nombre: plantilla.nombre,
          formato: FORMATOS[plantilla.formato as Formato] ?? plantilla.formato,
          activa: plantilla.activa,
          validez_dias: plantilla.validez_dias,
          asunto: plantilla.asunto,
          intro: plantilla.intro,
          items: leerItemsPlantilla(plantilla.items),
          bloques: leerBloques(plantilla.bloques),
        }}
        botonEstado={
          <BotonEstado
            grande
            activo={plantilla.activa}
            etiqueta={plantilla.nombre}
            accion={cambiarEstadoPlantilla.bind(null, id, !plantilla.activa)}
          />
        }
      />
    </>
  )
}
