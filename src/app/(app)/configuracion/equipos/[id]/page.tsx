import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { FormularioEquipo } from '@/components/configuracion/equipos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { capacidadTexto, VARIABLES_EQUIPO } from '@/lib/catalogos/equipos'
import { frasesConVariables } from '@/lib/plantillas/frases'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarEquipo, cambiarEstadoEquipo } from '../../actions'

export const metadata: Metadata = { title: 'Equipo' }

export default async function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const [{ data: equipo, error }, { data: plantillas, error: errorPlantillas }] = await Promise.all([
    supabase
      .from('equipos')
      .select('id, nombre, capacidad_tn, marca, modelo, identificacion, descripcion, activo')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('plantillas').select('bloques').eq('activa', true),
  ])
  if (error) throw error
  if (errorPlantillas) throw errorPlantillas
  if (!equipo) notFound()

  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Equipos', href: '/configuracion/equipos' },
          { texto: equipo.nombre },
        ]}
      />
      <FormularioEquipo
        accion={actualizarEquipo.bind(null, id)}
        equipo={{ ...equipo, capacidad_tn: capacidadTexto(equipo.capacidad_tn) }}
        botonEstado={
          <BotonEstado
            grande
            activo={equipo.activo}
            etiqueta={equipo.nombre}
            accion={cambiarEstadoEquipo.bind(null, id, !equipo.activo)}
          />
        }
        frases={frasesConVariables(plantillas, VARIABLES_EQUIPO)}
      />
    </>
  )
}
