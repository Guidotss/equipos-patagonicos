'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { changeVoidingDocument } from '@/app/(app)/documentos/actions'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'

export function ActionsDocument({ id, anulado: voided }: { id: string; anulado: boolean }) {
  const [confirmando, setConfirmando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const inCurso = useRef(false)
  function change(restore: boolean) {
    if (inCurso.current) return
    inCurso.current = true
    setError('')
    startTransition(async () => {
      try {
        const result = await changeVoidingDocument(id, restore)
        if (!result.ok) {
          setError(result.message)
          return
        }
        setConfirmando(false)
        if (!restore)
          toast('Documento anulado', { action: { label: 'Deshacer', onClick: () => change(true) }, duration: 10000 })
        else toast.success('Documento restaurado')
        button.current?.focus()
      } catch {
        setError('No se pudo completar la operación. Reintentá.')
      } finally {
        inCurso.current = false
      }
    })
  }
  return (
    <div className="flex flex-col items-end gap-2">
      {!confirmando ? (
        <Button
          ref={button}
          type="button"
          variant={voided ? 'outline' : 'ghost'}
          size="sm"
          disabled={pending}
          onClick={() => (voided ? change(true) : setConfirmando(true))}
        >
          {voided ? 'Restaurar' : 'Anular'}
        </Button>
      ) : (
        <InlineConfirmation
          pregunta="¿Anular este documento?"
          detail="Los archivos se conservan. Si es un pago, su importe vuelve al saldo de las facturas."
          textConfirm="Confirmar anulación"
          textPending="Anulando…"
          tone="peligro"
          pendiente={pending}
          onConfirm={() => change(false)}
          onCancelar={() => {
            setConfirmando(false)
            button.current?.focus()
          }}
        />
      )}
      {error ? (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
