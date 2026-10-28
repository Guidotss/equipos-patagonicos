import type { Metadata } from 'next'
import { BarraMigas, Contenido } from '@/components/app-shell/encabezado'
import { EncabezadoFormulario } from '@/components/formulario/estructura-formulario'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { crearCliente } from '../actions'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NuevoClientePage() {
  return (
    <>
      <BarraMigas migas={[{ texto: 'Clientes', href: '/clientes' }, { texto: 'Nuevo cliente' }]} />
      <Contenido className="max-w-6xl pb-28">
        <EncabezadoFormulario titulo="Nuevo cliente" descripcion="Los contactos se agregan desde la ficha, después de crearlo." />
          <ClienteForm accion={crearCliente} textoBoton="Crear cliente" />
      </Contenido>
    </>
  )
}
