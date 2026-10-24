import type { Metadata } from 'next'
import { Plantillas } from '@/components/configuracion/plantillas'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { cambiarEstadoPlantilla, renombrarPlantilla } from '../actions'

export const metadata: Metadata = { title: 'Plantillas' }

export default async function PlantillasPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plantillas')
    .select('id, nombre, formato, activa')
    .order('activa', { ascending: false })
    .order('nombre')
  if (error) throw error

  const plantillas = data.map((plantilla) => ({
    ...plantilla,
    formato: FORMATOS[plantilla.formato as Formato] ?? plantilla.formato,
    renombrar: renombrarPlantilla.bind(null, plantilla.id),
    boton: (
      <BotonEstado
        activo={plantilla.activa}
        etiqueta={plantilla.nombre}
        accion={cambiarEstadoPlantilla.bind(null, plantilla.id, !plantilla.activa)}
      />
    ),
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
        <p className="text-sm text-muted-foreground">
          Los textos se editan desde una cotización con &quot;Guardar como plantilla&quot; (próxima etapa).
        </p>
      </div>
      <Plantillas plantillas={plantillas} />
    </section>
  )
}
