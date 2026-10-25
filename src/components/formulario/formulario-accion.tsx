'use client'

import { useActionState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ESTADO_INICIAL, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'
import { MensajeFormulario } from './mensaje-formulario'

/**
 * Formulario conectado a una Server Action: muestra errores, conserva lo escrito si falla,
 * avisa el éxito con un toast y deshabilita el botón mientras guarda.
 */
export function FormularioAccion({
  accion,
  textoBoton,
  className,
  soloLectura = false,
  boton = true,
  alGuardar,
  children,
}: {
  accion: AccionFormulario
  textoBoton: string
  className?: string
  soloLectura?: boolean
  /** false cuando el formulario dibuja su propio botón de envío (p. ej. arriba, junto al título). */
  boton?: boolean
  alGuardar?: () => void
  children: (estado: EstadoFormulario, pendiente: boolean) => React.ReactNode
}) {
  const [estado, despachar, pendiente] = useActionState(
    async (previo: EstadoFormulario, formData: FormData) => {
      const resultado = await accion(previo, formData)
      if (resultado.ok) {
        if (resultado.mensaje) toast.success(resultado.mensaje)
        alGuardar?.()
      }
      return resultado
    },
    ESTADO_INICIAL,
  )

  return (
    <form action={despachar} noValidate className="space-y-4">
      <fieldset disabled={soloLectura || pendiente} className={cn('min-w-0', className)}>
        {children(estado, pendiente)}
      </fieldset>
      {/* Sin botón propio, el formulario muestra el mensaje donde ubica su botón. */}
      {boton ? <MensajeFormulario estado={estado} /> : null}
      {soloLectura || !boton ? null : (
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : textoBoton}
        </Button>
      )}
    </form>
  )
}
