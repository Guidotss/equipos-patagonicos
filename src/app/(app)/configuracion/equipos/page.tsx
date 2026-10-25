import type { Metadata } from 'next'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { Equipos, NuevoEquipo } from '@/components/configuracion/equipos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { capacidadTexto } from '@/lib/catalogos/equipos'
import { createClient } from '@/lib/supabase/server'
import { cambiarEstadoEquipo } from '../actions'

export const metadata: Metadata = { title: 'Equipos' }

export default async function EquiposPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, marca, modelo, identificacion, descripcion, activo')
    .order('activo', { ascending: false })
    .order('capacidad_tn', { ascending: false, nullsFirst: false })
  if (error) throw error

  const equipos = data.map((equipo) => ({
    ...equipo,
    capacidad_tn: capacidadTexto(equipo.capacidad_tn),
    boton: (
      <BotonEstado
        activo={equipo.activo}
        etiqueta={equipo.nombre}
        accion={cambiarEstadoEquipo.bind(null, equipo.id, !equipo.activo)}
      />
    ),
  }))

  return (
    <>
      <BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Equipos' }]} />
      <Contenido>
        <EncabezadoPagina
          titulo="Equipos"
          descripcion="La descripción de cada equipo se usa como “Equipo ofrecido” en las cotizaciones."
          acciones={<NuevoEquipo />}
        />
        <Equipos equipos={equipos} />
      </Contenido>
    </>
  )
}
