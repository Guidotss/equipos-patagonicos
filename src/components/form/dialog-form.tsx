'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ActionForm, StatusForm } from '@/lib/forms'
import { FormAction } from './form-action'

/** Diálogo con un formulario adentro. Se cierra solo cuando la acción sale bien. */
export function DialogForm({
  titulo: title,
  descripcion,
  disparador,
  accion,
  textButton,
  children,
}: {
  titulo: string
  descripcion?: string
  disparador: React.ReactNode
  accion: ActionForm
  textButton: string
  children: (estado: StatusForm) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{disparador}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>
        {/* Se monta solo abierto: cada apertura arranca con el estado limpio. */}
        {open ? (
          <FormAction
            accion={accion}
            textButton={textButton}
            className="space-y-4"
            onSave={() => setOpen(false)}
          >
            {children}
          </FormAction>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
