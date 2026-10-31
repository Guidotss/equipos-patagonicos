import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ACTION_PROGRESS_LABEL,
  approvesVersionNoSent,
  errorDateApproval,
  reasonBlock,
  statusOnRevert,
} from '@/lib/quotes/actions-status'
import type { StatusContext } from '@/lib/quotes/context-status'
import { type PendingList, type StatusEditor } from '@/lib/quotes/editor/types'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { ActionsStatus } from './quote-actions.types'

/** El texto del botón mientras corre esta acción (otra acción en curso solo deshabilita). */
function progressText(actions: ActionsStatus, action: keyof typeof ACTION_PROGRESS_LABEL): string | undefined {
  return actions.currentAction === action ? ACTION_PROGRESS_LABEL[action] : undefined
}

function ConfirmApproval({
  state,
  context,
  pendingList,
  actions,
  hasChangesWithoutSave,
  today,
}: {
  state: StatusEditor
  context: StatusContext
  pendingList: PendingList
  actions: ActionsStatus
  hasChangesWithoutSave: boolean
  today: string
}) {
  // Hoy por defecto; si la cotización tiene fecha futura, su fecha (no se aprueba antes de cotizar).
  const [date, setDate] = useState(today < state.fecha ? state.fecha : today)
  const error = errorDateApproval(date, state.fecha)
  // Lo que falta se vuelve a mirar con la confirmación abierta: si se vacía un campo, Aprobar se deshabilita.
  const block = reasonBlock('aprobar', pendingList)
  const warning = approvesVersionNoSent(state, context, hasChangesWithoutSave)
  // Una nueva todavía no tiene número: aprobar la guarda primero (decisión 12).
  const newQuote = state.numero === null

  return (
    <InlineConfirmation
      tone="exito"
      pregunta={newQuote ? '¿Guardar y aprobar la cotización?' : `¿Aprobar la cotización N° ${state.numero}?`}
      detail={
        newQuote
          ? 'Se guarda con un número nuevo, queda como presupuesto y ya no se modifica.'
          : 'Queda como presupuesto y ya no se modifica.'
      }
      textConfirm="Aprobar"
      textPending={progressText(actions, 'aprobar')}
      pendiente={actions.busy}
      confirmDeshabilitado={error !== null || block !== null}
      onConfirm={() => void actions.approve(date)}
      onCancelar={actions.cancel}
    >
      <div className="basis-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label htmlFor="fecha-aprobacion" className="text-[13px] font-normal text-muted-foreground">
            Fecha de aprobación
          </Label>
          <Input
            id="fecha-aprobacion"
            type="date"
            value={date}
            min={state.fecha}
            onChange={(event) => setDate(event.target.value)}
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
    </InlineConfirmation>
  )
}

export function QuoteActionConfirmation({
  state,
  context,
  pendingList,
  actions,
  hasChangesWithoutSave,
  today,
}: {
  state: StatusEditor
  context: StatusContext
  pendingList: PendingList
  actions: ActionsStatus
  hasChangesWithoutSave: boolean
  today: string
}) {
  const { confirmation } = actions
  if (!confirmation || confirmation.type === 'recargar') return null
  const number = state.numero
  const shared = {
    pendiente: actions.busy,
    onCancelar: actions.cancel,
    onConfirm: () => void actions.confirm(),
  }

  switch (confirmation.type) {
    case 'aprobar':
      return (
        <ConfirmApproval
          state={state}
          context={context}
          pendingList={pendingList}
          actions={actions}
          hasChangesWithoutSave={hasChangesWithoutSave}
          today={today}
        />
      )
    case 'rechazar':
      return (
        <InlineConfirmation
          {...shared}
          tone="aviso"
          pregunta={`¿Marcar la cotización N° ${number} como rechazada?`}
          detail="Se puede reabrir después."
          textConfirm="Rechazar"
          textPending={progressText(actions, 'rechazar')}
        />
      )
    case 'reabrir':
      return (
        <InlineConfirmation
          {...shared}
          tone="neutro"
          pregunta={`¿Reabrir la cotización N° ${number}?`}
          detail="Vuelve a borrador y se puede editar."
          textConfirm="Reabrir"
          textPending={progressText(actions, 'reabrir')}
        />
      )
    case 'revertir':
      return (
        <InlineConfirmation
          {...shared}
          tone="aviso"
          pregunta={`¿Revertir la aprobación de la cotización N° ${number}?`}
          detail={`Vuelve a ${statusOnRevert(context)} y deja de ser un presupuesto. El PDF aprobado queda guardado.`}
          textConfirm="Revertir"
          textPending={progressText(actions, 'revertir')}
        />
      )
    case 'borrar':
      return (
        <InlineConfirmation
          {...shared}
          tone="peligro"
          pregunta={`¿Eliminar el borrador N° ${number}?`}
          detail="No se puede deshacer."
          textConfirm="Eliminar"
          textPending={progressText(actions, 'borrar')}
        />
      )
    case 'duplicar':
      return (
        <InlineConfirmation
          tone="aviso"
          pregunta="Tenés cambios sin guardar."
          detail="«Duplicar lo guardado» copia la última versión guardada y descarta estos cambios."
          textConfirm="Guardar y duplicar"
          textPending={progressText(actions, 'duplicar')}
          alternativa={{ texto: 'Duplicar lo guardado', onChoose: () => void actions.duplicate(false) }}
          pendiente={actions.busy}
          onConfirm={() => void actions.duplicate(true)}
          onCancelar={actions.cancel}
        />
      )
    case 'finalizar':
      return (
        <InlineConfirmation
          {...shared}
          tone="exito"
          pregunta={`Esta cotización reemplaza a la N° ${confirmation.previous.numero}, que sigue en curso como presupuesto.`}
          detail="Si el trabajo sigue con esta, finalizá el anterior."
          textConfirm={`Finalizar el presupuesto N° ${confirmation.previous.numero}`}
          textPending={actions.currentAction === 'finalizar' ? 'Finalizando…' : undefined}
          textCancelar="Dejarlo en curso"
          onConfirm={() => void actions.finish()}
        />
      )
  }
}
