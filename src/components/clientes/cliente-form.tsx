'use client'

import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { AccionesFormulario, HojaFormulario } from '@/components/formulario/estructura-formulario'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import type { AccionFormulario } from '@/lib/formularios'
import { CamposCliente, type ValoresCliente } from './campos-cliente'

export function ClienteForm({
  accion,
  inicial,
  textoBoton,
}: {
  accion: AccionFormulario
  inicial?: ValoresCliente
  textoBoton: string
}) {
  return (
    <FormularioAccion accion={accion} textoBoton={textoBoton} boton={false}>
      {(estado, pendiente) => <>
        <div className="mb-4"><MensajeFormulario estado={estado} /></div>
        <HojaFormulario><CamposCliente estado={estado} inicial={inicial} /></HojaFormulario>
        <AccionesFormulario volver="/clientes" textoBoton={textoBoton} pendiente={pendiente} detalle={inicial ? undefined : 'Los contactos se agregan después de crear el cliente.'} />
      </>}
    </FormularioAccion>
  )
}
