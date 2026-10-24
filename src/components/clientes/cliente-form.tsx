'use client'

import { FormularioAccion } from '@/components/formulario/formulario-accion'
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
    <FormularioAccion accion={accion} textoBoton={textoBoton}>
      {(estado) => <CamposCliente estado={estado} inicial={inicial} />}
    </FormularioAccion>
  )
}
