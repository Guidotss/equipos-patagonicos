import type { Metadata } from 'next'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { Firmantes, NuevoFirmante } from '@/components/configuracion/firmantes'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { createClient } from '@/lib/supabase/server'
import { actualizarFirmante, cambiarEstadoFirmante, crearFirmante } from '../actions'

export const metadata: Metadata = { title: 'Firmantes' }

export default async function FirmantesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, email, activo')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw error

  const firmantes = data.map((firmante) => ({
    ...firmante,
    actualizar: actualizarFirmante.bind(null, firmante.id),
    boton: (
      <BotonEstado
        activo={firmante.activo}
        etiqueta={firmante.nombre}
        accion={cambiarEstadoFirmante.bind(null, firmante.id, !firmante.activo)}
      />
    ),
  }))

  return (
    <>
      <BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Firmantes' }]} />
      <Contenido className="space-y-6">
        <EncabezadoPagina
          titulo="Firmantes"
          descripcion="Nombre, cargo y teléfono que aparecen al pie de cada cotización."
          acciones={<NuevoFirmante crear={crearFirmante} />}
        />
        <Firmantes firmantes={firmantes} />
      </Contenido>
    </>
  )
}
