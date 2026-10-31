'use client'
// src/components/formulario/confirmacion-en-lugar.tsx

import { useCallback, useId, useLayoutEffect, useRef } from 'react'
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
 * Adónde vuelve el foco al cerrarse lo decide quien la abre (alCancelar / alConfirmar). Mientras la acción corre
 * (`pendiente`) los botones se deshabilitan y el foco queda en el grupo, no en el body.
 */
export function ConfirmationInLugar({
  pregunta,
  detail,
  textConfirm,
  textPending,
  textCancelar = 'Cancelar',
  tone = 'aviso',
  pendiente: pending = false,
  confirmDeshabilitado = false,
  onConfirm,
  onCancelar,
  alternativa,
  children,
  className,
}: {
  pregunta: string
  detail?: React.ReactNode
  textConfirm: string
  /** Texto del botón mientras corre la acción ("Aprobando…"). */
  textPending?: string
  /** Por ejemplo "Dejarlo en curso" (Task 12). */
  textCancelar?: string
  tone?: keyof typeof TONOS
  pendiente?: boolean
  /** Solo el botón de confirmar, por ejemplo con una fecha inválida (Task 12). */
  confirmDeshabilitado?: boolean
  onConfirm: () => void
  onCancelar: () => void
  /** Otra forma de confirmar, entre Cancelar y el botón principal (p. ej. "Duplicar lo guardado"). */
  alternativa?: { texto: string; onChoose: () => void }
  /** Controles entre el texto y los botones (p. ej. la fecha de aprobación de la Task 12). */
  children?: React.ReactNode
  className?: string
}) {
  const id = useId()
  const grupo = useRef<HTMLDivElement>(null)
  const enfocar = useCallback((button: HTMLButtonElement | null) => button?.focus(), [])

  // Con la acción en curso, Cancelar y el botón que se tocó quedan deshabilitados y el navegador mandaría el foco al
  // body: lo toma el grupo (si estaba adentro), que sigue escuchando Escape para cuando Cancelar se habilite de nuevo.
  useLayoutEffect(() => {
    const element = grupo.current
    if (!pending || !element) return
    const activo = document.activeElement
    if (activo === null || activo === document.body || element.contains(activo)) element.focus()
  }, [pending])

  return (
    <div
      ref={grupo}
      role="group"
      tabIndex={-1}
      aria-labelledby={`${id}-pregunta`}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && !pending) {
          evento.stopPropagation()
          onCancelar()
        }
      }}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-4 py-3 text-sm outline-none',
        TONOS[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p id={`${id}-pregunta`} className="font-medium [overflow-wrap:anywhere]">
          {pregunta}
        </p>
        {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      </div>
      {children}
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button ref={enfocar} type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          {textCancelar}
        </Button>
        {alternativa ? (
          <Button type="button" variant="outline" onClick={alternativa.onChoose} disabled={pending}>
            {alternativa.texto}
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onConfirm}
          disabled={pending || confirmDeshabilitado}
          className={
            tone === 'peligro' ? 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30' : undefined
          }
        >
          {pending && textPending ? textPending : textConfirm}
        </Button>
      </div>
    </div>
  )
}
