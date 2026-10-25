import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { FormularioEquipo } from '@/components/configuracion/equipos'
import { VARIABLES_EQUIPO } from '@/lib/catalogos/equipos'
import { frasesConVariables } from '@/lib/plantillas/frases'
import { createClient } from '@/lib/supabase/server'
import { crearEquipo } from '../../actions'

export const metadata: Metadata = { title: 'Nuevo equipo' }

export default async function NuevoEquipoPage() {
  const supabase = await createClient()
  const { data: plantillas, error } = await supabase.from('plantillas').select('bloques').eq('activa', true)
  if (error) throw error

  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Equipos', href: '/configuracion/equipos' },
          { texto: 'Nuevo equipo' },
        ]}
      />
      <FormularioEquipo accion={crearEquipo} frases={frasesConVariables(plantillas, VARIABLES_EQUIPO)} />
    </>
  )
}
