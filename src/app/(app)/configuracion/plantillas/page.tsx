import type { Metadata } from 'next'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { Plantillas } from '@/components/configuracion/plantillas'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { cambiarEstadoPlantilla } from '../actions'

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
    boton: (
      <BotonEstado
        activo={plantilla.activa}
        etiqueta={plantilla.nombre}
        accion={cambiarEstadoPlantilla.bind(null, plantilla.id, !plantilla.activa)}
      />
    ),
  }))

  return (
    <>
      <BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Plantillas' }]} />
      <Contenido>
        <EncabezadoPagina
          titulo="Plantillas"
          descripcion="Los textos se editan desde una cotización con “Guardar como plantilla” (próxima etapa)."
        />
        <Plantillas plantillas={plantillas} />
      </Contenido>
    </>
  )
}
