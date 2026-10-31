'use client'

import { useRef, useState, useTransition } from 'react'
import { cambiarEstadoPresupuesto } from '@/app/(app)/presupuestos/actions'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Campo } from '@/components/formulario/campo'

export function AccionesPresupuesto({ id, estado }: { id: string; estado: string | null }) {
  const [destino, setDestino] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [pendiente, startTransition] = useTransition()
  const enCurso = useRef(false)
  function cambiar() {
    if (enCurso.current) return
    enCurso.current = true
    startTransition(async () => {
      try {
        const resultado = await cambiarEstadoPresupuesto({ id, estado: destino, motivo })
        if (!resultado.ok) {
          setError(resultado.mensaje)
          return
        }
        setDestino(null)
        setError('')
        setMotivo('')
      } catch {
        setError('No se pudo cambiar el estado. Reintentá.')
      } finally {
        enCurso.current = false
      }
    })
  }
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {destino ? (
        <ConfirmacionEnLugar
          pregunta={
            destino === 'anulado'
              ? '¿Anular este presupuesto?'
              : destino === 'finalizado'
                ? '¿Finalizar este presupuesto?'
                : '¿Volver a ponerlo en curso?'
          }
          textoConfirmar={destino === 'anulado' ? 'Confirmar anulación' : 'Confirmar'}
          pendiente={pendiente}
          tono={destino === 'anulado' ? 'peligro' : 'aviso'}
          confirmarDeshabilitado={destino === 'anulado' && !motivo.trim()}
          alConfirmar={cambiar}
          alCancelar={() => {
            setDestino(null)
            setError('')
          }}
        >
          {destino === 'anulado' ? (
            <Campo id="motivo-anulacion" etiqueta="Motivo de anulación">
              <Textarea
                id="motivo-anulacion"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                maxLength={2000}
                disabled={pendiente}
                required
              />
            </Campo>
          ) : null}
        </ConfirmacionEnLugar>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDestino(estado === 'en_curso' ? 'finalizado' : 'en_curso')}>
            {estado === 'en_curso' ? 'Finalizar' : 'Volver a en curso'}
          </Button>
          {estado !== 'anulado' ? (
            <Button variant="destructive" onClick={() => setDestino('anulado')}>
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
