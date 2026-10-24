'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { AccionFormulario, EstadoFormulario } from '@/lib/formularios'
import { FormularioAccion } from './formulario-accion'

/** Diálogo con un formulario adentro. Se cierra solo cuando la acción sale bien. */
export function DialogoFormulario({
  titulo,
  descripcion,
  disparador,
  accion,
  textoBoton,
  children,
}: {
  titulo: string
  descripcion?: string
  disparador: React.ReactNode
  accion: AccionFormulario
  textoBoton: string
  children: (estado: EstadoFormulario) => React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>{disparador}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>
        {/* Se monta solo abierto: cada apertura arranca con el estado limpio. */}
        {abierto ? (
          <FormularioAccion
            accion={accion}
            textoBoton={textoBoton}
            className="space-y-4"
            alGuardar={() => setAbierto(false)}
          >
            {children}
          </FormularioAccion>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
