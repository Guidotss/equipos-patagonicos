import type { Metadata } from 'next'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { crearCliente } from '../actions'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NuevoClientePage() {
  return (
    <>
      <BarraMigas migas={[{ texto: 'Clientes', href: '/clientes' }, { texto: 'Nuevo cliente' }]} />
      <Contenido className="space-y-6">
        <EncabezadoPagina titulo="Nuevo cliente" descripcion="Los contactos se agregan desde la ficha, después de crearlo." />
        <div className="max-w-3xl rounded-xl border bg-card p-6 shadow-xs">
          <ClienteForm accion={crearCliente} textoBoton="Crear cliente" />
        </div>
      </Contenido>
    </>
  )
}
