import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { Contactos } from '@/components/clientes/contactos'
import { HistorialComercial } from '@/components/clientes/historial-comercial'
import { BotonEstado } from '@/components/formulario/boton-estado'
import { Pastilla } from '@/components/ui/pastilla'
import { CONDICIONES_IVA } from '@/lib/clientes/esquemas'
import { formatCuit } from '@/lib/cuit'
import { iniciales } from '@/lib/format/texto'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'
import { actualizarCliente, cambiarEstadoCliente } from '../actions'

export const metadata: Metadata = { title: 'Cliente' }

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*, contactos(id, nombre, cargo, email, telefono)')
    .eq('id', id)
    .order('nombre', { referencedTable: 'contactos' })
    .maybeSingle()
  if (error) throw error
  if (!cliente) notFound()

  const datosClave = [
    cliente.cuit ? `CUIT ${formatCuit(cliente.cuit)}` : null,
    CONDICIONES_IVA[cliente.condicion_iva as keyof typeof CONDICIONES_IVA] ?? null,
    [cliente.localidad, cliente.provincia].filter(Boolean).join(', ') || null,
  ].filter(Boolean)

  return (
    <>
      <BarraMigas migas={[{ texto: 'Clientes', href: '/clientes' }, { texto: cliente.razon_social }]} />
      <EncabezadoFicha
        titulo={cliente.razon_social}
        recuadro={iniciales(cliente.razon_social, 1)}
        estado={cliente.activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>}
        datos={datosClave.length > 0 ? datosClave.join(' • ') : null}
        acciones={
          <BotonEstado
            activo={cliente.activo}
            etiqueta={cliente.razon_social}
            accion={cambiarEstadoCliente.bind(null, id, !cliente.activo)}
          />
        }
      />

      <Contenido className="grid max-w-6xl items-start gap-6 space-y-0 pb-28 lg:grid-cols-2">
        <section aria-label="Datos del cliente" className="min-w-0 lg:col-span-2">
          <ClienteForm
            accion={actualizarCliente.bind(null, id)}
            inicial={{ ...cliente, cuit: cliente.cuit ? formatCuit(cliente.cuit) : '' }}
            textoBoton="Guardar cambios"
          />
        </section>

        <Contactos clienteId={id} contactos={cliente.contactos} />
        <section className="min-w-0"><HistorialComercial clienteId={id} /></section>
      </Contenido>
    </>
  )
}
