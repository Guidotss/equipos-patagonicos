'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatTimestamp,
  isConfirmable,
  isEditable,
  LABEL_ACTION,
  ACTION_PROGRESS_LABEL,
  layoutActions,
  reasonBlock,
  type ActionStatus,
  type ButtonAction,
} from '@/lib/quotes/actions-status'
import type { StatusContext } from '@/lib/quotes/context-status'
import type { PendingList, StatusEditor } from '@/lib/quotes/editor/types'
import { cn } from '@/lib/utils'
import { Ellipsis, FileText } from 'lucide-react'
import { useRef } from 'react'

import type { ActionsStatus } from './quote-actions.types'
export { downloadFile } from './download-file'
export type { ActionsStatus, Confirmation, ServerUpdateMode, SavedQuote } from './quote-actions.types'
export { useQuoteActions as useActionsStatus } from './use-quote-actions'

/** Primario de cabecera; con la barra inferior a la vista (< 90rem) se ve como outline: el primario ahí es Guardar. */
const PRIMARY = 'shadow-md shadow-primary/20'
const PRIMARY_WITH_BAR = cn(
  PRIMARY,
  'max-[90rem]:border-border max-[90rem]:bg-background max-[90rem]:text-foreground max-[90rem]:shadow-none max-[90rem]:hover:bg-muted',
)

function ButtonOfAction({
  button,
  state,
  pendingList,
  actions: actionsStatus,
  className,
}: {
  button: ButtonAction
  state: StatusEditor
  pendingList: PendingList
  actions: ActionsStatus
  /** Visibilidad según el ancho (va en el elemento de afuera). */
  className?: string
}) {
  const { action, primary } = button
  const variant = primary ? 'default' : 'outline'
  const style = primary ? (isEditable(state) ? PRIMARY_WITH_BAR : PRIMARY) : undefined

  if (action === 'descargar') {
    if (!state.id) return null
    return (
      <Button asChild variant={variant} size="lg" className={cn(style, className)}>
        <a href={`/cotizaciones/${state.id}/pdf?descargar=1`} download>
          {LABEL_ACTION.descargar}
        </a>
      </Button>
    )
  }

  const block = reasonBlock(action, pendingList)
  const element = (
    <Button
      type="button"
      variant={variant}
      size="lg"
      className={cn(style, block ? undefined : className)}
      disabled={actionsStatus.busy || block !== null}
      onClick={() => actionsStatus.start(action)}
    >
      {actionsStatus.currentAction === action ? ACTION_PROGRESS_LABEL[action] : LABEL_ACTION[action]}
    </Button>
  )
  // Un botón deshabilitado no recibe el puntero: el motivo va en el title de un envoltorio.
  return block ? (
    <span title={block} className={cn('inline-flex', className)}>
      {element}
    </span>
  ) : (
    element
  )
}

/**
 * Los botones de estado del encabezado del editor, a la derecha de Guardar (que dibuja EncabezadoEditor), según el
 * estado (relev-visual §3.2), con el menú ⋯ y el historial de envíos. En el celular los secundarios pasan al menú.
 */
export function ActionsHeader({
  state,
  context,
  pendingList,
  actions: actionsStatus,
}: {
  state: StatusEditor
  context: StatusContext
  pendingList: PendingList
  actions: ActionsStatus
}) {
  const buttonMenu = useRef<HTMLButtonElement>(null)
  /** La confirmación que eligió un ítem del menú: se abre cuando el menú terminó de cerrarse (onCloseAutoFocus). */
  const pending = useRef<ActionStatus | null>(null)
  const { buttons, menu } = layoutActions(state, context)
  const secondary = buttons.filter((button) => !button.primary).map((button) => button.action)
  const id = state.id
  const inMenu: { action: ActionStatus; mobileOnly: boolean }[] = [
    ...secondary.map((action) => ({ action, mobileOnly: true })),
    ...menu.map((action) => ({ action, mobileOnly: false })),
  ]
  // Sin acciones propias ni envíos, el menú solo tiene lo que en escritorio ya está a la vista.
  const mobileOnlyMenu = menu.length === 0 && context.envios.length === 0

  return (
    <>
      {buttons.map((button) => (
        <ButtonOfAction
          key={button.action}
          button={button}
          state={state}
          pendingList={pendingList}
          actions={actionsStatus}
          className={button.primary ? undefined : 'hidden md:inline-flex'}
        />
      ))}
      {/* También en una nueva (sin id): en el celular, Aprobar va en el menú. */}
      {inMenu.length + context.envios.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={buttonMenu}
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Más acciones"
              disabled={actionsStatus.busy}
              className={mobileOnlyMenu ? 'md:hidden' : undefined}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-56"
            onCloseAutoFocus={(event) => {
              const action = pending.current
              if (!action) return
              pending.current = null
              // Recién acá el FocusScope del menú (modal) ya no atrapa el foco: abrir la confirmación en onSelect
              // dejaría el foco en el ítem y después en body. El foco pasa por el ⋯ (adonde vuelve al cancelar) y, con
              // el render de la confirmación, queda en su "Cancelar" (decisión 15).
              event.preventDefault()
              buttonMenu.current?.focus()
              actionsStatus.start(action)
            }}
          >
            {inMenu.map(({ action, mobileOnly }) =>
              action === 'descargar' ? (
                <DropdownMenuItem key={action} asChild className={mobileOnly ? 'md:hidden' : undefined}>
                  <a href={`/cotizaciones/${id}/pdf?descargar=1`} download>
                    {LABEL_ACTION.descargar}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={action}
                  className={mobileOnly ? 'md:hidden' : undefined}
                  variant={action === 'borrar' ? 'destructive' : 'default'}
                  disabled={reasonBlock(action, pendingList) !== null}
                  onSelect={() => {
                    // Una confirmación se abre cuando el menú se cerró del todo (ver onCloseAutoFocus). Duplicar
                    // también espera: con cambios sin guardar pregunta qué copiar.
                    if (isConfirmable(action) || action === 'duplicar') pending.current = action
                    else actionsStatus.start(action)
                  }}
                >
                  {LABEL_ACTION[action]}
                </DropdownMenuItem>
              ),
            )}
            {context.envios.length > 0 ? (
              <>
                {inMenu.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Envíos (lo que recibió el cliente)
                </DropdownMenuLabel>
                {context.envios.map((delivery, index) => (
                  <DropdownMenuItem key={delivery.id} asChild>
                    <a href={`/cotizaciones/${id}/pdf?envio=${delivery.id}`} target="_blank" rel="noopener">
                      <FileText aria-hidden />
                      {formatTimestamp(delivery.enviada_at)}
                      {index === 0 ? ' · último' : ''}
                    </a>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
