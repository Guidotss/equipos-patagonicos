'use client'

import * as actions from '@/app/(app)/cotizaciones/actions'
import {
  isConfirmable,
  isConflict,
  isEditable,
  layoutActions,
  reasonBlock,
  type ActionConfirmable,
  type ActionStatus,
} from '@/lib/quotes/actions-status'
import type { StatusContext } from '@/lib/quotes/context-status'
import type { PendingList, StatusEditor } from '@/lib/quotes/editor/types'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { downloadFile } from './download-file'
import type { ActionsStatus, Confirmation, ServerUpdateMode, SavedQuote } from './quote-actions.types'

/** Una Server Action que no llegó a responder (sin red, por ejemplo): no hay mensaje del servidor que mostrar. */
const MESSAGE_WITHOUT_RESPONSE = 'No se pudo completar la operación. Probá de nuevo.'

const SUCCESS_MESSAGES = {
  rechazar: 'Cotización rechazada',
  reabrir: 'Cotización reabierta',
  revertir: 'Se revirtió la aprobación',
} as const

function confirmationInitial(
  action: ActionConfirmable | null | undefined,
  state: StatusEditor,
  context: StatusContext,
  pendingList: PendingList,
): Confirmation | null {
  if (!action) return null
  const { buttons, menu } = layoutActions(state, context)
  const available = buttons.some((button) => button.action === action) || menu.includes(action)
  return available && reasonBlock(action, pendingList) === null ? { type: action } : null
}

/**
 * Las acciones de estado del editor: guardar antes si hace falta, correr la transición con la versión que vio la
 * pantalla, confirmar en el lugar y ofrecer "Recargar" ante un conflicto de versión (decisiones 11 a 15).
 */
export function useQuoteActions({
  state,
  context,
  pendingList,
  hasChangesWithoutSave,
  save,
  action,
  setAction,
  conflict,
  setConflict,
  awaitServerUpdate,
  actionInitial,
}: {
  state: StatusEditor
  context: StatusContext
  pendingList: PendingList
  hasChangesWithoutSave: boolean
  /**
   * El guardar del editor (Task 8): guarda si hay cambios y devuelve la versión (la actual si no había nada que
   * guardar); null si no se pudo (ya lo mostró) o si la cotización no se edita. Con `navigate: false`, una nueva se
   * crea sin ir a su página; con `notify: false`, sin el toast de guardado.
   */
  save: (options?: { navigate?: boolean; notify?: boolean }) => Promise<SavedQuote | null>
  /** La acción en curso del editor (Task 8): con una en curso se deshabilitan todos los botones. */
  action: string | null
  setAction: (action: string | null) => void
  conflict: boolean
  setConflict: (conflict: boolean) => void
  /**
   * Avisa al editor que tome la versión del servidor (null: ya no la espera). 'adoptar' toma la próxima distinta de
   * `localVersion` y de la que había en `initial` al llamarlo; 'descartar' toma lo que haya en `initial` cuando
   * termina el refresco de "Recargar" (`reloading`), sin comparar versiones.
   */
  awaitServerUpdate: (mode: ServerUpdateMode | null, localVersion?: string | null) => void
  /** ?accion= de la URL: abre esa confirmación al entrar. */
  actionInitial?: ActionConfirmable | null
}): ActionsStatus {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(() =>
    confirmationInitial(actionInitial, state, context, pendingList),
  )
  const [reloading, startReload] = useTransition()
  const [transitioning, setTransitioning] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)

  // Un cambio de estado de la cotización (enviada, aprobada…, también el que trae la versión de otro) cierra la
  // confirmación abierta: preguntaba por el estado anterior. La oferta de finalizar el presupuesto anterior es la
  // consecuencia de aprobar y se abre justo antes del cambio, así que queda. Se ajusta durante el render.
  const [observedStatus, setObservedStatus] = useState(state.estado)
  if (state.estado !== observedStatus) {
    setObservedStatus(state.estado)
    if (confirmation && confirmation.type !== 'finalizar') setConfirmation(null)
  }

  // El ?accion= ya se usó: se saca de la URL para que recargar la página no vuelva a abrir la confirmación.
  useEffect(() => {
    if (actionInitial) window.history.replaceState(null, '', window.location.pathname)
  }, [actionInitial])

  function open(nextConfirmation: Confirmation) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmation(nextConfirmation)
  }

  function cancel() {
    const back = trigger.current
    trigger.current = null
    setConfirmation(null)
    // El foco vuelve al botón que abrió la confirmación, si sigue en pantalla.
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus()
    })
  }

  function failure(message: string) {
    if (isConflict(message)) {
      setConfirmation(null)
      setConflict(true)
    } else {
      toast.error(message)
    }
  }

  /**
   * La Server Action tiró en vez de devolver un resultado (sin red, por ejemplo). Se avisa y el editor deja de esperar
   * la versión del servidor: si la siguiera esperando, tomaría la próxima que traiga una revalidación (la de otro
   * usuario) debajo de lo local, y el guardado siguiente la pisaría sin conflicto.
   */
  function withoutResponse(error: unknown) {
    unstable_rethrow(error)
    console.error(error)
    awaitServerUpdate(null)
    toast.error(MESSAGE_WITHOUT_RESPONSE)
  }

  /**
   * Guarda lo que haya sin guardar y devuelve el id y la versión con los que seguir (null si no se pudo). Una nueva
   * se guarda sin navegar (decisión 12): la transición usa el id que vuelve y después se va a su página. Sin el toast
   * de guardado: el que avisa es el de la transición (o su error). `save()` deja la acción del editor en null al
   * terminar: se vuelve a marcar la que sigue corriendo.
   */
  async function versionForAction(ownAction: string): Promise<{ id: string; version: string } | null> {
    if (!hasChangesWithoutSave && state.id && state.version) return { id: state.id, version: state.version }
    const savedQuote = await save({ navigate: false, notify: false })
    setAction(ownAction)
    return savedQuote ? { id: savedQuote.id, version: savedQuote.version } : null
  }

  /**
   * Una nueva se guardó sin navegar para seguir con la transición: al terminar (también si la transición falló, ya
   * quedó guardada) va a su página, que arma el editor con lo que hay en la base. Una existente solo se refresca.
   */
  function afterTransition(id: string, wasNew: boolean, succeeded: boolean) {
    if (wasNew) router.replace(`/cotizaciones/${id}`)
    else if (succeeded) router.refresh()
  }

  async function send(action: 'enviar' | 'reenviar') {
    const wasNew = state.id === null
    let savedQuoteId: string | null = null
    setAction(action)
    setTransitioning(true)
    try {
      const savedQuote = await versionForAction(action)
      if (!savedQuote) return
      const { id, version } = savedQuote
      savedQuoteId = id
      awaitServerUpdate('adoptar', version)
      const result = await actions.sendQuote(id, version)
      if (!result.ok) {
        awaitServerUpdate(null)
        failure(result.message)
        return afterTransition(id, wasNew, false)
      }
      downloadFile(`/cotizaciones/${id}/pdf?envio=${result.datos.envioId}&descargar=1`)
      toast.success('Se descargó el PDF y la cotización quedó enviada')
      afterTransition(id, wasNew, true)
    } catch (error) {
      withoutResponse(error)
      if (savedQuoteId) afterTransition(savedQuoteId, wasNew, false)
    } finally {
      setAction(null)
      setTransitioning(false)
    }
  }

  /**
   * Se duplica lo guardado. Con `saveFirst` ("Guardar y duplicar"), lo que hay en pantalla se guarda primero; sin
   * él ("Duplicar lo guardado"), los cambios sin guardar se pierden al ir a la copia.
   */
  async function duplicate(saveFirst: boolean) {
    const id = state.id
    if (!id) return
    setAction('duplicar')
    setTransitioning(true)
    try {
      if (saveFirst && !(await versionForAction('duplicar'))) return
      const result = await actions.duplicateQuote(id)
      if (!result.ok) return failure(result.message)
      setConfirmation(null)
      toast.success('Se creó una copia en borrador')
      router.push(`/cotizaciones/${result.datos.id}`)
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
      setTransitioning(false)
    }
  }

  function start(action: ActionStatus) {
    if (isConfirmable(action)) return open({ type: action })
    // Otra acción cierra la confirmación que haya abierta.
    trigger.current = null
    setConfirmation(null)
    if (action === 'enviar' || action === 'reenviar') return void send(action)
    if (action === 'duplicar') {
      // Con cambios sin guardar se pregunta qué copiar: guardar la original en silencio pisaría, por ejemplo, una
      // enviada con algo que el cliente no recibió.
      if (hasChangesWithoutSave && isEditable(state)) return open({ type: 'duplicar' })
      return void duplicate(false)
    }
    if (action === 'descargar' && state.id) downloadFile(`/cotizaciones/${state.id}/pdf?descargar=1`)
  }

  async function approve(date: string) {
    const wasNew = state.id === null
    let savedQuoteId: string | null = null
    setAction('aprobar')
    setTransitioning(true)
    try {
      const savedQuote = await versionForAction('aprobar')
      if (!savedQuote) return
      const { id, version } = savedQuote
      savedQuoteId = id
      awaitServerUpdate('adoptar', version)
      const result = await actions.approveQuote(id, version, date)
      if (!result.ok) {
        awaitServerUpdate(null)
        failure(result.message)
        return afterTransition(id, wasNew, false)
      }
      toast.success('Cotización aprobada')
      // Una renegociación: se ofrece cerrar el presupuesto que esta reemplaza (decisión 14). Una nueva no reemplaza a
      // ninguna (reemplaza_a solo lo pone duplicar), así que navegar no pierde la oferta.
      const { anterior: previous } = result.datos
      setConfirmation(previous ? { type: 'finalizar', previous } : null)
      afterTransition(id, wasNew, true)
    } catch (error) {
      withoutResponse(error)
      if (savedQuoteId) afterTransition(savedQuoteId, wasNew, false)
    } finally {
      setAction(null)
      setTransitioning(false)
    }
  }

  async function confirm() {
    const id = state.id
    const type = confirmation?.type
    if (!id || (type !== 'rechazar' && type !== 'reabrir' && type !== 'revertir' && type !== 'borrar')) return
    setAction(type)
    setTransitioning(true)
    try {
      if (type === 'borrar') {
        const result = await actions.removeQuote(id)
        if (!result.ok) return failure(result.message)
        toast.success(`Se eliminó el borrador N° ${state.numero}`)
        router.push('/cotizaciones')
        return
      }
      // Una rechazada no se edita: lo que no se guardó se guarda antes de rechazar para no perderlo.
      const version = type === 'rechazar' ? (await versionForAction('rechazar'))?.version : state.version
      if (!version) return
      awaitServerUpdate('adoptar', version)
      const result =
        type === 'rechazar'
          ? await actions.rejectQuote(id)
          : type === 'reabrir'
            ? await actions.reopenQuote(id)
            : await actions.revertApproval(id)
      if (!result.ok) {
        awaitServerUpdate(null)
        return failure(result.message)
      }
      setConfirmation(null)
      toast.success(SUCCESS_MESSAGES[type])
      router.refresh()
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
      setTransitioning(false)
    }
  }

  async function finish() {
    if (confirmation?.type !== 'finalizar') return
    const { previous } = confirmation
    setAction('finalizar')
    try {
      const result = await actions.finishBudget(previous.id)
      if (!result.ok) return failure(result.message)
      setConfirmation(null)
      toast.success(`Se finalizó el presupuesto N° ${previous.numero}`)
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
    }
  }

  function confirmReload() {
    // El editor toma lo que haya en `initial` cuando termina el refresco (`reloading`), sin comparar versiones: una
    // revalidación anterior pudo haber traído ya la del otro usuario, o una intermedia.
    awaitServerUpdate('descartar')
    setConfirmation(null)
    setConflict(false)
    startReload(() => router.refresh())
  }

  function reload() {
    if (hasChangesWithoutSave) return open({ type: 'recargar' })
    confirmReload()
  }

  return {
    currentAction: action,
    busy: action !== null || reloading,
    transitioning,
    reloading,
    confirmation,
    conflict,
    start,
    cancel,
    approve,
    confirm,
    duplicate,
    finish,
    reload,
    confirmReload,
  }
}
