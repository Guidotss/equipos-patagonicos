import type { Metadata } from 'next'
import { Equipos } from '@/components/configuracion/equipos'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { createClient } from '@/lib/supabase/server'
import { actualizarEquipo, cambiarEstadoEquipo, crearEquipo } from '../actions'

export const metadata: Metadata = { title: 'Equipos' }

/** "60.5" (numeric de Postgres) → "60,5" para mostrar y editar. */
function capacidadTexto(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',')
}

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
    actualizar: actualizarEquipo.bind(null, equipo.id),
    boton: (
      <BotonEstado
        activo={equipo.activo}
        etiqueta={equipo.nombre}
        accion={cambiarEstadoEquipo.bind(null, equipo.id, !equipo.activo)}
      />
    ),
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
        <p className="text-sm text-muted-foreground">La descripción de cada equipo se usa como &quot;Equipo ofrecido&quot; en las cotizaciones.</p>
      </div>
      <Equipos equipos={equipos} crear={crearEquipo} />
    </section>
  )
}
