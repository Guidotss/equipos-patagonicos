'use client'
// src/components/formulario/confirmacion-en-lugar.tsx

import { useCallback, useId } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TONOS = {
  exito: 'border-green-200 bg-green-50',
  peligro: 'border-destructive/30 bg-destructive/5',
  aviso: 'border-amber-200 bg-amber-50',
  neutro: 'border-border bg-muted/60',
} as const

/**
 * Confirmación sin modal (decisión 15): aparece en el lugar, el foco va a "Cancelar" y Escape cancela.
 * Adónde vuelve el foco al cerrarse lo decide quien la abre (alCancelar / alConfirmar).
 */
export function ConfirmacionEnLugar({
  pregunta,
  detalle,
  textoConfirmar,
  textoPendiente,
  textoCancelar = 'Cancelar',
  tono = 'aviso',
  pendiente = false,
  confirmarDeshabilitado = false,
  alConfirmar,
  alCancelar,
  children,
  className,
}: {
  pregunta: string
  detalle?: React.ReactNode
  textoConfirmar: string
  /** Texto del botón mientras corre la acción ("Aprobando…"). */
  textoPendiente?: string
  /** Por ejemplo "Dejarlo en curso" (Task 12). */
  textoCancelar?: string
  tono?: keyof typeof TONOS
  pendiente?: boolean
  /** Solo el botón de confirmar, por ejemplo con una fecha inválida (Task 12). */
  confirmarDeshabilitado?: boolean
  alConfirmar: () => void
  alCancelar: () => void
  /** Controles entre el texto y los botones (p. ej. la fecha de aprobación de la Task 12). */
  children?: React.ReactNode
  className?: string
}) {
  const id = useId()
  const enfocar = useCallback((boton: HTMLButtonElement | null) => boton?.focus(), [])

  return (
    <div
      role="group"
      aria-labelledby={`${id}-pregunta`}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && !pendiente) {
          evento.stopPropagation()
          alCancelar()
        }
      }}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-4 py-3 text-sm', TONOS[tono], className)}
    >
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p id={`${id}-pregunta`} className="font-medium [overflow-wrap:anywhere]">
          {pregunta}
        </p>
        {detalle ? <p className="text-muted-foreground">{detalle}</p> : null}
      </div>
      {children}
      <div className="ml-auto flex gap-2">
        <Button ref={enfocar} type="button" variant="outline" onClick={alCancelar} disabled={pendiente}>
          {textoCancelar}
        </Button>
        <Button
          type="button"
          onClick={alConfirmar}
          disabled={pendiente || confirmarDeshabilitado}
          className={
            tono === 'peligro' ? 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30' : undefined
          }
        >
          {pendiente && textoPendiente ? textoPendiente : textoConfirmar}
        </Button>
      </div>
    </div>
  )
}
