'use client'

import { useActionState, useEffect, useId } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { STATUS_INITIAL, type ActionForm, type StatusForm } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { MessageForm } from './message-form'

/**
 * Formulario conectado a una Server Action: muestra errores, conserva lo escrito si falla,
 * avisa el éxito con un toast y deshabilita el botón mientras guarda.
 */
export function FormAction({
  accion,
  textButton,
  className,
  soloQuery = false,
  button = true,
  onSave,
  header,
  children,
}: {
  accion: ActionForm
  textButton: string
  className?: string
  soloQuery?: boolean
  /** false cuando el formulario dibuja su propio botón de envío (p. ej. arriba, junto al título). */
  button?: boolean
  onSave?: () => void
  /**
   * Se dibuja antes del <form>, no adentro: puede llevar otros forms (p. ej. Activar/Desactivar) sin anidarlos.
   * Su botón de guardar apunta al formulario con form={formulario}.
   */
  header?: (contexto: { pendiente: boolean; form: string }) => React.ReactNode
  children: (estado: StatusForm, pending: boolean) => React.ReactNode
}) {
  const form = useId()
  const [estado, despachar, pending] = useActionState(
    async (previous: StatusForm, formData: FormData) => {
      const result = await accion(previous, formData)
      if (result.ok) {
        if (result.message) toast.success(result.message)
        onSave?.()
      }
      return result
    },
    STATUS_INITIAL,
  )

  // Con errores, el foco va al primer campo marcado: en celular el botón de guardar puede quedar lejos del error.
  useEffect(() => {
    if (estado.ok || Object.keys(estado.errors).length === 0) return
    document.getElementById(form)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [estado, form])

  return (
    <>
      {header?.({ pendiente: pending, form })}
      <form id={form} action={despachar} noValidate className="space-y-4">
        <fieldset disabled={soloQuery || pending} className={cn('min-w-0', className)}>
          {children(estado, pending)}
        </fieldset>
        {/* Sin botón propio, el formulario muestra el mensaje donde ubica su botón. */}
        {button ? <MessageForm estado={estado} /> : null}
        {soloQuery || !button ? null : (
          <Button type="submit" disabled={pending} className="w-full md:w-auto">
            {pending ? 'Guardando…' : textButton}
          </Button>
        )}
      </form>
    </>
  )
}
