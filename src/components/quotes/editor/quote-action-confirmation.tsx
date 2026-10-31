import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LABEL_IN_CURSO,
  approvesVersionNoSent,
  errorDateApproval,
  reasonBlock,
  statusOnRevert,
} from '@/lib/quotes/actions-status'
import type { ContextoStatus } from '@/lib/quotes/context-status'
import { type PendingList, type StatusEditor } from '@/lib/quotes/editor/types'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { ActionsStatus } from './quote-actions.types'

/** El texto del botón mientras corre esta acción (otra acción en curso solo deshabilita). */
function textInCurso(actions: ActionsStatus, accion: keyof typeof LABEL_IN_CURSO): string | undefined {
  return actions.inCurso === accion ? LABEL_IN_CURSO[accion] : undefined
}

function ConfirmApproval({
  estado,
  contexto,
  pendingList,
  actions,
  hasChangesWithoutSave,
  today,
}: {
  estado: StatusEditor
  contexto: ContextoStatus
  pendingList: PendingList
  actions: ActionsStatus
  hasChangesWithoutSave: boolean
  today: string
}) {
  // Hoy por defecto; si la cotización tiene fecha futura, su fecha (no se aprueba antes de cotizar).
  const [fecha, setDate] = useState(today < estado.fecha ? estado.fecha : today)
  const error = errorDateApproval(fecha, estado.fecha)
  // Lo que falta se vuelve a mirar con la confirmación abierta: si se vacía un campo, Aprobar se deshabilita.
  const block = reasonBlock('aprobar', pendingList)
  const warning = approvesVersionNoSent(estado, contexto, hasChangesWithoutSave)
  // Una nueva todavía no tiene número: aprobar la guarda primero (decisión 12).
  const nueva = estado.numero === null

  return (
    <ConfirmationInLugar
      tone="exito"
      pregunta={nueva ? '¿Guardar y aprobar la cotización?' : `¿Aprobar la cotización N° ${estado.numero}?`}
      detail={
        nueva
          ? 'Se guarda con un número nuevo, queda como presupuesto y ya no se modifica.'
          : 'Queda como presupuesto y ya no se modifica.'
      }
      textConfirm="Aprobar"
      textPending={textInCurso(actions, 'aprobar')}
      pendiente={actions.busy}
      confirmDeshabilitado={error !== null || block !== null}
      onConfirm={() => void actions.aprobar(fecha)}
      onCancelar={actions.cancelar}
    >
      <div className="basis-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label htmlFor="fecha-aprobacion" className="text-[13px] font-normal text-muted-foreground">
            Fecha de aprobación
          </Label>
          <Input
            id="fecha-aprobacion"
            type="date"
            value={fecha}
            min={estado.fecha}
            onChange={(evento) => setDate(evento.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'fecha-aprobacion-error' : undefined}
            className="h-8 w-40 bg-background"
          />
        </div>
        {error ? (
          <p id="fecha-aprobacion-error" className="text-destructive">
            {error}
          </p>
        ) : null}
        {block ? <p className="text-destructive">{block}.</p> : null}
        {warning ? (
          <p className="flex gap-1.5 text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Se aprueba la versión actual, que el cliente no recibió.
          </p>
        ) : null}
      </div>
    </ConfirmationInLugar>
  )
}

export function QuoteActionConfirmation({
  estado,
  contexto,
  pendingList,
  actions,
  hasChangesWithoutSave,
  today,
}: {
  estado: StatusEditor
  contexto: ContextoStatus
  pendingList: PendingList
  actions: ActionsStatus
  hasChangesWithoutSave: boolean
  today: string
}) {
  const { confirmation } = actions
  if (!confirmation || confirmation.tipo === 'recargar') return null
  const numero = estado.numero
  const shared = {
    pendiente: actions.busy,
    onCancelar: actions.cancelar,
    onConfirm: () => void actions.confirm(),
  }

  switch (confirmation.tipo) {
    case 'aprobar':
      return (
        <ConfirmApproval
          estado={estado}
          contexto={contexto}
          pendingList={pendingList}
          actions={actions}
          hasChangesWithoutSave={hasChangesWithoutSave}
          today={today}
        />
      )
    case 'rechazar':
      return (
        <ConfirmationInLugar
          {...shared}
          tone="aviso"
          pregunta={`¿Marcar la cotización N° ${numero} como rechazada?`}
          detail="Se puede reabrir después."
          textConfirm="Rechazar"
          textPending={textInCurso(actions, 'rechazar')}
        />
      )
    case 'reabrir':
      return (
        <ConfirmationInLugar
          {...shared}
          tone="neutro"
          pregunta={`¿Reabrir la cotización N° ${numero}?`}
          detail="Vuelve a borrador y se puede editar."
          textConfirm="Reabrir"
          textPending={textInCurso(actions, 'reabrir')}
        />
      )
    case 'revertir':
      return (
        <ConfirmationInLugar
          {...shared}
          tone="aviso"
          pregunta={`¿Revertir la aprobación de la cotización N° ${numero}?`}
          detail={`Vuelve a ${statusOnRevert(contexto)} y deja de ser un presupuesto. El PDF aprobado queda guardado.`}
          textConfirm="Revertir"
          textPending={textInCurso(actions, 'revertir')}
        />
      )
    case 'borrar':
      return (
        <ConfirmationInLugar
          {...shared}
          tone="peligro"
          pregunta={`¿Eliminar el borrador N° ${numero}?`}
          detail="No se puede deshacer."
          textConfirm="Eliminar"
          textPending={textInCurso(actions, 'borrar')}
        />
      )
    case 'duplicar':
      return (
        <ConfirmationInLugar
          tone="aviso"
          pregunta="Tenés cambios sin guardar."
          detail="«Duplicar lo guardado» copia la última versión guardada y descarta estos cambios."
          textConfirm="Guardar y duplicar"
          textPending={textInCurso(actions, 'duplicar')}
          alternativa={{ texto: 'Duplicar lo guardado', onChoose: () => void actions.duplicar(false) }}
          pendiente={actions.busy}
          onConfirm={() => void actions.duplicar(true)}
          onCancelar={actions.cancelar}
        />
      )
    case 'finalizar':
      return (
        <ConfirmationInLugar
          {...shared}
          tone="exito"
          pregunta={`Esta cotización reemplaza a la N° ${confirmation.anterior.numero}, que sigue en curso como presupuesto.`}
          detail="Si el trabajo sigue con esta, finalizá el anterior."
          textConfirm={`Finalizar el presupuesto N° ${confirmation.anterior.numero}`}
          textPending={actions.inCurso === 'finalizar' ? 'Finalizando…' : undefined}
          textCancelar="Dejarlo en curso"
          onConfirm={() => void actions.finalizar()}
        />
      )
  }
}
