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
  dateTimeOfMark,
  isConfirmable,
  isEditable,
  LABEL_ACTION,
  LABEL_IN_CURSO,
  layoutActions,
  reasonBlock,
  type ActionStatus,
  type ButtonAction,
} from '@/lib/quotes/actions-status'
import type { ContextoStatus } from '@/lib/quotes/context-status'
import type { PendingList, StatusEditor } from '@/lib/quotes/editor/types'
import { cn } from '@/lib/utils'
import { Ellipsis, FileText } from 'lucide-react'
import { useRef } from 'react'

import type { ActionsStatus } from './quote-actions.types'
export { downloadFile } from './download-file'
export type { ActionsStatus, Confirmation, EsperaServidor, QuoteGuardada } from './quote-actions.types'
export { useQuoteActions as useActionsStatus } from './use-quote-actions'

/** Primario de cabecera; con la barra inferior a la vista (< 90rem) se ve como outline: el primario ahí es Guardar. */
const PRIMARIO = 'shadow-md shadow-primary/20'
const PRIMARIO_WITH_BAR = cn(
  PRIMARIO,
  'max-[90rem]:border-border max-[90rem]:bg-background max-[90rem]:text-foreground max-[90rem]:shadow-none max-[90rem]:hover:bg-muted',
)

function ButtonOfAction({
  button,
  estado,
  pendingList,
  actions: actionsStatus,
  className,
}: {
  button: ButtonAction
  estado: StatusEditor
  pendingList: PendingList
  actions: ActionsStatus
  /** Visibilidad según el ancho (va en el elemento de afuera). */
  className?: string
}) {
  const { accion, primaria } = button
  const variante = primaria ? 'default' : 'outline'
  const style = primaria ? (isEditable(estado) ? PRIMARIO_WITH_BAR : PRIMARIO) : undefined

  if (accion === 'descargar') {
    if (!estado.id) return null
    return (
      <Button asChild variant={variante} size="lg" className={cn(style, className)}>
        <a href={`/cotizaciones/${estado.id}/pdf?descargar=1`} download>
          {LABEL_ACTION.descargar}
        </a>
      </Button>
    )
  }

  const block = reasonBlock(accion, pendingList)
  const element = (
    <Button
      type="button"
      variant={variante}
      size="lg"
      className={cn(style, block ? undefined : className)}
      disabled={actionsStatus.busy || block !== null}
      onClick={() => actionsStatus.iniciar(accion)}
    >
      {actionsStatus.inCurso === accion ? LABEL_IN_CURSO[accion] : LABEL_ACTION[accion]}
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
  estado,
  contexto,
  pendingList,
  actions: actionsStatus,
}: {
  estado: StatusEditor
  contexto: ContextoStatus
  pendingList: PendingList
  actions: ActionsStatus
}) {
  const buttonMenu = useRef<HTMLButtonElement>(null)
  /** La confirmación que eligió un ítem del menú: se abre cuando el menú terminó de cerrarse (onCloseAutoFocus). */
  const pending = useRef<ActionStatus | null>(null)
  const { botones, menu } = layoutActions(estado, contexto)
  const secundarias = botones.filter((button) => !button.primaria).map((button) => button.accion)
  const id = estado.id
  const inMenu: { accion: ActionStatus; soloCelular: boolean }[] = [
    ...secundarias.map((accion) => ({ accion, soloCelular: true })),
    ...menu.map((accion) => ({ accion, soloCelular: false })),
  ]
  // Sin acciones propias ni envíos, el menú solo tiene lo que en escritorio ya está a la vista.
  const menuSoloCelular = menu.length === 0 && contexto.envios.length === 0

  return (
    <>
      {botones.map((button) => (
        <ButtonOfAction
          key={button.accion}
          button={button}
          estado={estado}
          pendingList={pendingList}
          actions={actionsStatus}
          className={button.primaria ? undefined : 'hidden md:inline-flex'}
        />
      ))}
      {/* También en una nueva (sin id): en el celular, Aprobar va en el menú. */}
      {inMenu.length + contexto.envios.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={buttonMenu}
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Más acciones"
              disabled={actionsStatus.busy}
              className={menuSoloCelular ? 'md:hidden' : undefined}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-56"
            onCloseAutoFocus={(evento) => {
              const accion = pending.current
              if (!accion) return
              pending.current = null
              // Recién acá el FocusScope del menú (modal) ya no atrapa el foco: abrir la confirmación en onSelect
              // dejaría el foco en el ítem y después en body. El foco pasa por el ⋯ (adonde vuelve al cancelar) y, con
              // el render de la confirmación, queda en su "Cancelar" (decisión 15).
              evento.preventDefault()
              buttonMenu.current?.focus()
              actionsStatus.iniciar(accion)
            }}
          >
            {inMenu.map(({ accion, soloCelular }) =>
              accion === 'descargar' ? (
                <DropdownMenuItem key={accion} asChild className={soloCelular ? 'md:hidden' : undefined}>
                  <a href={`/cotizaciones/${id}/pdf?descargar=1`} download>
                    {LABEL_ACTION.descargar}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={accion}
                  className={soloCelular ? 'md:hidden' : undefined}
                  variant={accion === 'borrar' ? 'destructive' : 'default'}
                  disabled={reasonBlock(accion, pendingList) !== null}
                  onSelect={() => {
                    // Una confirmación se abre cuando el menú se cerró del todo (ver onCloseAutoFocus). Duplicar
                    // también espera: con cambios sin guardar pregunta qué copiar.
                    if (isConfirmable(accion) || accion === 'duplicar') pending.current = accion
                    else actionsStatus.iniciar(accion)
                  }}
                >
                  {LABEL_ACTION[accion]}
                </DropdownMenuItem>
              ),
            )}
            {contexto.envios.length > 0 ? (
              <>
                {inMenu.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Envíos (lo que recibió el cliente)
                </DropdownMenuLabel>
                {contexto.envios.map((envio, index) => (
                  <DropdownMenuItem key={envio.id} asChild>
                    <a href={`/cotizaciones/${id}/pdf?envio=${envio.id}`} target="_blank" rel="noopener">
                      <FileText aria-hidden />
                      {dateTimeOfMark(envio.enviada_at)}
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
