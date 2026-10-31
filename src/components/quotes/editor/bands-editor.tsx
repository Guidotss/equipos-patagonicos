'use client'

import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { bandsStatus, isEditable, pendingListVisible, type Band, type Pending } from '@/lib/quotes/actions-status'
import type { StatusContext } from '@/lib/quotes/context-status'
import { MESSAGE_CONFLICT } from '@/lib/quotes/editor/constants'
import { type PendingList, type StatusEditor } from '@/lib/quotes/editor/types'
import { cn } from '@/lib/utils'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'
import type { ActionsStatus } from './quote-actions.types'

import { QuoteActionConfirmation } from './quote-action-confirmation'

/** Forma común de las franjas (relev-visual §3.9, como BorrarContacto en contacto-form.tsx). */
const BAND = 'rounded-lg border px-4 py-3 text-sm'

const TONE_BAND: Record<Band['type'], string> = {
  enviada: 'border-blue-200 bg-blue-50',
  vencida: 'border-amber-200 bg-amber-50',
  aprobada: 'border-green-200 bg-green-50',
  rechazada: 'bg-muted',
  duplicada: 'bg-muted',
}

const LINK = 'font-medium text-primary underline-offset-4 hover:underline'

function focusField(id: string) {
  const field = document.getElementById(id)
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  field.focus({ preventScroll: true })
}

function BandConflict({ actions }: { actions: ActionsStatus }) {
  if (actions.confirmation?.type === 'recargar') {
    return (
      <InlineConfirmation
        tone="aviso"
        pregunta="Se descartan los cambios que no guardaste y se carga la versión actual."
        textConfirm="Descartar y recargar"
        pendiente={actions.busy}
        onConfirm={actions.confirmReload}
        onCancelar={actions.cancel}
      />
    )
  }
  return (
    <div
      role="alert"
      className={cn(BAND, 'flex flex-wrap items-center gap-x-4 gap-y-2 border-amber-200 bg-amber-50')}
    >
      <p className="flex min-w-0 flex-1 basis-72 gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <span>{MESSAGE_CONFLICT}. Lo que escribiste sigue acá: recargá para ver la versión actual.</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={actions.reload} disabled={actions.busy}>
        <RefreshCw aria-hidden />
        Recargar
      </Button>
    </div>
  )
}

function BandPendingList({ missing, unknownVariables }: { missing: Pending[]; unknownVariables: string[] }) {
  return (
    <div className={cn(BAND, 'flex items-start gap-2.5 border-brand-yellow/60 bg-brand-yellow/10')}>
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-yellow" />
      <div className="space-y-1">
        {missing.length > 0 ? (
          <p>
            Para enviar falta completar:{' '}
            {missing.map((pending, index) => {
              const destination = pending.destination
              return (
                <Fragment key={pending.key}>
                  {index > 0 ? ' · ' : null}
                  {destination ? (
                    <button
                      type="button"
                      onClick={() => focusField(destination)}
                      className="font-semibold underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pending.text}
                    </button>
                  ) : (
                    <strong className="font-semibold">{pending.text}</strong>
                  )}
                </Fragment>
              )
            })}
          </p>
        ) : null}
        {unknownVariables.length > 0 ? (
          <p>
            Hay variables mal escritas en los textos:{' '}
            <strong className="font-semibold">{unknownVariables.join(', ')}</strong>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function BandOfStatus({ band, id }: { band: Band; id: string | null }) {
  return (
    <div className={cn(BAND, TONE_BAND[band.type])}>
      {band.type === 'duplicada' ? (
        <p>
          Duplicada de{' '}
          <Link href={`/cotizaciones/${band.anterior.id}`} className={LINK}>
            N° {band.anterior.numero}
          </Link>
        </p>
      ) : (
        <p>
          {band.text}
          {band.type === 'enviada' && band.envioId && id ? (
            <>
              {' '}
              <a
                href={`/cotizaciones/${id}/pdf?envio=${band.envioId}`}
                target="_blank"
                rel="noopener"
                className={LINK}
              >
                Ver lo que recibió el cliente
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}

/**
 * Lo que va entre el encabezado y las tarjetas: el conflicto de versión, la confirmación abierta, lo que falta para
 * enviar (franja amarilla, decisión 17) y el estado (enviada, vencida, aprobada, rechazada, duplicada).
 * Una confirmación abierta reemplaza a la franja de estado (salvo la de duplicada y la oferta de finalizar).
 */
export function BandsEditor({
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
  /** Hoy en Argentina ('YYYY-MM-DD'), del servidor: la fecha de aprobación por defecto. */
  today: string
}) {
  const { missing, unknownVariables } = pendingListVisible(pendingList, state)
  const withPendingList = isEditable(state) && (missing.length > 0 || unknownVariables.length > 0)
  const type = actions.confirmation?.type
  const confirming = type !== undefined && type !== 'recargar' && type !== 'finalizar'
  const bands = bandsStatus(state, context).filter((band) => !confirming || band.type === 'duplicada')

  if (!actions.conflict && !actions.confirmation && !withPendingList && bands.length === 0) return null

  return (
    <div className="space-y-3">
      {actions.conflict || type === 'recargar' ? <BandConflict actions={actions} /> : null}
      <QuoteActionConfirmation
        state={state}
        context={context}
        pendingList={pendingList}
        actions={actions}
        hasChangesWithoutSave={hasChangesWithoutSave}
        today={today}
      />
      {withPendingList ? <BandPendingList missing={missing} unknownVariables={unknownVariables} /> : null}
      {bands.map((band) => (
        <BandOfStatus key={band.type} band={band} id={state.id} />
      ))}
    </div>
  )
}
