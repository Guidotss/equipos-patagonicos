'use client'

import { useRef, useState, useTransition } from 'react'
import { changeStatusBudget } from '@/app/(app)/presupuestos/actions'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/form/field'

export function ActionsBudget({ id, estado }: { id: string; estado: string | null }) {
  const [destination, setDestination] = useState<string | null>(null)
  const [motivo, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const inCurso = useRef(false)
  function change() {
    if (inCurso.current) return
    inCurso.current = true
    startTransition(async () => {
      try {
        const result = await changeStatusBudget({ id, estado: destination, motivo })
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
        inCurso.current = false
      }
    })
  }
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {destination ? (
        <ConfirmationInLugar
          pregunta={
            destination === 'anulado'
              ? '¿Anular este presupuesto?'
              : destination === 'finalizado'
                ? '¿Finalizar este presupuesto?'
                : '¿Volver a ponerlo en curso?'
          }
          textConfirm={destination === 'anulado' ? 'Confirmar anulación' : 'Confirmar'}
          pendiente={pending}
          tone={destination === 'anulado' ? 'peligro' : 'aviso'}
          confirmDeshabilitado={destination === 'anulado' && !motivo.trim()}
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
                value={motivo}
                onChange={(evento) => setReason(evento.target.value)}
                maxLength={2000}
                disabled={pending}
                required
              />
            </Field>
          ) : null}
        </ConfirmationInLugar>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDestination(estado === 'en_curso' ? 'finalizado' : 'en_curso')}>
            {estado === 'en_curso' ? 'Finalizar' : 'Volver a en curso'}
          </Button>
          {estado !== 'anulado' ? (
            <Button variant="destructive" onClick={() => setDestination('anulado')}>
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
