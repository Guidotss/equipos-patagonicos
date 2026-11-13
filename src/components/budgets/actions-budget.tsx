'use client'

import { useRef, useState, useTransition } from 'react'
import { changeStatusBudget } from '@/app/(app)/presupuestos/actions'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/form/field'

type BudgetTransition = 'en_curso' | 'finalizado' | 'anulado'

export function ActionsBudget({
  id,
  status,
  paidInFull,
}: {
  id: string
  status: string | null
  paidInFull: boolean
}) {
  const [destination, setDestination] = useState<BudgetTransition | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const submitting = useRef(false)
  const open = status === 'en_curso'
  const cancelled = status === 'anulado'
  function change() {
    if (!destination || submitting.current) return
    submitting.current = true
    startTransition(async () => {
      try {
        const result = await changeStatusBudget({
          id,
          estado: destination,
          motivo: reason,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setDestination(null)
        setError('')
        setReason('')
      } catch {
        setError('No se pudo cambiar el estado. Reintentá.')
      } finally {
        submitting.current = false
      }
    })
  }
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {destination ? (
        <InlineConfirmation
          pregunta={
            destination === 'anulado'
              ? '¿Anular este presupuesto?'
              : destination === 'finalizado'
                ? '¿Confirmás que el trabajo está cobrado?'
                : cancelled
                  ? '¿Restaurar este presupuesto?'
                  : '¿Quitar el cierre manual?'
          }
          detail={
            destination === 'en_curso' && !cancelled
              ? 'El estado volverá a depender del cobro registrado.'
              : undefined
          }
          textConfirm={
            destination === 'anulado' ? 'Confirmar anulación' : 'Confirmar'
          }
          pendiente={pending}
          tone={destination === 'anulado' ? 'peligro' : 'aviso'}
          confirmDeshabilitado={destination === 'anulado' && !reason.trim()}
          onConfirm={change}
          onCancelar={() => {
            setDestination(null)
            setError('')
          }}
        >
          {destination === 'anulado' ? (
            <Field id="motivo-anulacion" label="Motivo de anulación">
              <Textarea
                id="motivo-anulacion"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={2000}
                disabled={pending}
                required
              />
            </Field>
          ) : null}
        </InlineConfirmation>
      ) : (
        <div className="flex gap-2">
          {!open || !paidInFull ? (
            <Button
              variant="outline"
              onClick={() => setDestination(open ? 'finalizado' : 'en_curso')}
            >
              {open
                ? 'Finalizar'
                : cancelled
                  ? 'Restaurar presupuesto'
                  : 'Quitar cierre manual'}
            </Button>
          ) : null}
          {!cancelled ? (
            <Button
              variant="destructive"
              onClick={() => setDestination('anulado')}
            >
              Anular presupuesto
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
