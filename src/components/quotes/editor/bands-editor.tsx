'use client'
// src/components/cotizaciones/editor/franjas-editor.tsx

import { RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  approvesVersionNoSent,
  errorDateApproval,
  isEditable,
  statusOnRevert,
  LABEL_IN_CURSO,
  bandsStatus,
  reasonBlock,
  pendingListVisible,
  type Band,
  type Pending,
} from '@/lib/quotes/actions-status'
import type { ContextoStatus } from '@/lib/quotes/context-status'
import { MESSAGE_CONFLICT, type StatusEditor, type PendingList } from '@/lib/quotes/editor'
import { cn } from '@/lib/utils'
import type { ActionsStatus } from './actions-editor'

/** Forma común de las franjas (relev-visual §3.9, como BorrarContacto en contacto-form.tsx). */
const FRANJA = 'rounded-lg border px-4 py-3 text-sm'

const TONE_BAND: Record<Band['tipo'], string> = {
  enviada: 'border-blue-200 bg-blue-50',
  vencida: 'border-amber-200 bg-amber-50',
  aprobada: 'border-green-200 bg-green-50',
  rechazada: 'bg-muted',
  duplicada: 'bg-muted',
}

const ENLACE = 'font-medium text-primary underline-offset-4 hover:underline'

function enfocarField(id: string) {
  const field = document.getElementById(id)
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  field.focus({ preventScroll: true })
}

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

function ConfirmationAbierta({
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

function BandConflict({ actions }: { actions: ActionsStatus }) {
  if (actions.confirmation?.tipo === 'recargar') {
    return (
      <ConfirmationInLugar
        tone="aviso"
        pregunta="Se descartan los cambios que no guardaste y se carga la versión actual."
        textConfirm="Descartar y recargar"
        pendiente={actions.busy}
        onConfirm={actions.confirmRecarga}
        onCancelar={actions.cancelar}
      />
    )
  }
  return (
    <div role="alert" className={cn(FRANJA, 'flex flex-wrap items-center gap-x-4 gap-y-2 border-amber-200 bg-amber-50')}>
      <p className="flex min-w-0 flex-1 basis-72 gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <span>{MESSAGE_CONFLICT}. Lo que escribiste sigue acá: recargá para ver la versión actual.</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={actions.recargar} disabled={actions.busy}>
        <RefreshCw aria-hidden />
        Recargar
      </Button>
    </div>
  )
}

function BandPendingList({ missing, malEscritas }: { missing: Pending[]; malEscritas: string[] }) {
  return (
    <div className={cn(FRANJA, 'flex items-start gap-2.5 border-brand-yellow/60 bg-brand-yellow/10')}>
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-yellow" />
      <div className="space-y-1">
        {missing.length > 0 ? (
          <p>
            Para enviar falta completar:{' '}
            {missing.map((pending, index) => {
              const destination = pending.destination
              return (
                <Fragment key={pending.clave}>
                  {index > 0 ? ' · ' : null}
                  {destination ? (
                    <button
                      type="button"
                      onClick={() => enfocarField(destination)}
                      className="font-semibold underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pending.texto}
                    </button>
                  ) : (
                    <strong className="font-semibold">{pending.texto}</strong>
                  )}
                </Fragment>
              )
            })}
          </p>
        ) : null}
        {malEscritas.length > 0 ? (
          <p>
            Hay variables mal escritas en los textos: <strong className="font-semibold">{malEscritas.join(', ')}</strong>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function BandOfStatus({ band, id }: { band: Band; id: string | null }) {
  return (
    <div className={cn(FRANJA, TONE_BAND[band.tipo])}>
      {band.tipo === 'duplicada' ? (
        <p>
          Duplicada de{' '}
          <Link href={`/cotizaciones/${band.anterior.id}`} className={ENLACE}>
            N° {band.anterior.numero}
          </Link>
        </p>
      ) : (
        <p>
          {band.texto}
          {band.tipo === 'enviada' && band.envioId && id ? (
            <>
              {' '}
              <a href={`/cotizaciones/${id}/pdf?envio=${band.envioId}`} target="_blank" rel="noopener" className={ENLACE}>
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
  /** Hoy en Argentina ('YYYY-MM-DD'), del servidor: la fecha de aprobación por defecto. */
  today: string
}) {
  const { missing, malEscritas } = pendingListVisible(pendingList, estado)
  const withPendingList = isEditable(estado) && (missing.length > 0 || malEscritas.length > 0)
  const tipo = actions.confirmation?.tipo
  const confirmando = tipo !== undefined && tipo !== 'recargar' && tipo !== 'finalizar'
  const bands = bandsStatus(estado, contexto).filter((band) => !confirmando || band.tipo === 'duplicada')

  if (!actions.conflict && !actions.confirmation && !withPendingList && bands.length === 0) return null

  return (
    <div className="space-y-3">
      {actions.conflict || tipo === 'recargar' ? <BandConflict actions={actions} /> : null}
      <ConfirmationAbierta
        estado={estado}
        contexto={contexto}
        pendingList={pendingList}
        actions={actions}
        hasChangesWithoutSave={hasChangesWithoutSave}
        today={today}
      />
      {withPendingList ? <BandPendingList missing={missing} malEscritas={malEscritas} /> : null}
      {bands.map((band) => (
        <BandOfStatus key={band.tipo} band={band} id={estado.id} />
      ))}
    </div>
  )
}
