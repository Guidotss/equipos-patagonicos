'use client'

import { useLayoutEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { changeVoidingDocument } from '@/app/(app)/documentos/actions'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'

export function ActionsDocument({ id, anulado: voided, financialVersion }: { id: string; anulado: boolean; financialVersion?: number }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const inCurso = useRef(false)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (restoreFocus.current && !confirmando && !pending && button.current) {
      button.current.focus()
      restoreFocus.current = false
    }
  }, [confirmando, pending])
  function change(restore: boolean) {
    if (inCurso.current) return
    inCurso.current = true
    setError('')
    startTransition(async () => {
      try {
        const result = await changeVoidingDocument(id, restore, financialVersion === undefined ? undefined : { expectedVersion: financialVersion, correctionReason: reason })
        if (!result.ok) {
          setError(result.message)
          return
        }
        restoreFocus.current = true
        setConfirmando(false)
        if (!restore && financialVersion === undefined)
          toast('Documento anulado', { action: { label: 'Deshacer', onClick: () => change(true) }, duration: 10000 })
        else toast.success(restore ? 'Documento restaurado' : 'Documento anulado')
        setReason('')
        router.refresh()
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
          onClick={() => (voided && financialVersion === undefined ? change(true) : setConfirmando(true))}
        >
          {voided ? 'Restaurar' : 'Anular'}
        </Button>
      ) : (
        <InlineConfirmation
          pregunta={voided ? '¿Restaurar este documento?' : '¿Anular este documento?'}
          detail={voided ? 'Se volverá a incluir el documento en los saldos.' : 'Los archivos se conservan. Los importes reconocidos pueden modificar los saldos.'}
          textConfirm={voided ? 'Confirmar restauración' : 'Confirmar anulación'}
          textPending={voided ? 'Restaurando…' : 'Anulando…'}
          tone="peligro"
          pendiente={pending}
          confirmDeshabilitado={financialVersion !== undefined && !reason.trim()}
          onConfirm={() => change(voided)}
          onCancelar={() => {
            restoreFocus.current = true
            setConfirmando(false)
          }}
        >
          {financialVersion !== undefined ? <label className="flex flex-col gap-1">Motivo<Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required /></label> : null}
        </InlineConfirmation>
      )}
      {error ? (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
