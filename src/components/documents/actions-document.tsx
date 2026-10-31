'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cambiarAnulacionDocumento } from '@/app/(app)/documentos/actions'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'

export function AccionesDocumento({ id, anulado }: { id: string; anulado: boolean }) {
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState('')
  const boton = useRef<HTMLButtonElement>(null)
  const enCurso = useRef(false)
  function cambiar(restaurar: boolean) {
    if (enCurso.current) return
    enCurso.current = true
    setError('')
    startTransition(async () => {
      try {
        const resultado = await cambiarAnulacionDocumento(id, restaurar)
        if (!resultado.ok) {
          setError(resultado.mensaje)
          return
        }
        setConfirmando(false)
        if (!restaurar)
          toast('Documento anulado', { action: { label: 'Deshacer', onClick: () => cambiar(true) }, duration: 10000 })
        else toast.success('Documento restaurado')
        boton.current?.focus()
      } catch {
        setError('No se pudo completar la operación. Reintentá.')
      } finally {
        enCurso.current = false
      }
    })
  }
  return (
    <div className="flex flex-col items-end gap-2">
      {!confirmando ? (
        <Button
          ref={boton}
          type="button"
          variant={anulado ? 'outline' : 'ghost'}
          size="sm"
          disabled={pendiente}
          onClick={() => (anulado ? cambiar(true) : setConfirmando(true))}
        >
          {anulado ? 'Restaurar' : 'Anular'}
        </Button>
      ) : (
        <ConfirmacionEnLugar
          pregunta="¿Anular este documento?"
          detalle="Los archivos se conservan. Si es un pago, su importe vuelve al saldo de las facturas."
          textoConfirmar="Confirmar anulación"
          textoPendiente="Anulando…"
          tono="peligro"
          pendiente={pendiente}
          alConfirmar={() => cambiar(false)}
          alCancelar={() => {
            setConfirmando(false)
            boton.current?.focus()
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
