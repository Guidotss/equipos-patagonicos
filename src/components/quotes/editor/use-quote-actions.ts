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
import type { ContextoStatus } from '@/lib/quotes/context-status'
import type { PendingList, StatusEditor } from '@/lib/quotes/editor/types'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { downloadFile } from './download-file'
import type { ActionsStatus, Confirmation, EsperaServidor, QuoteGuardada } from './quote-actions.types'

/** Una Server Action que no llegó a responder (sin red, por ejemplo): no hay mensaje del servidor que mostrar. */
const MESSAGE_WITHOUT_RESPONSE = 'No se pudo completar la operación. Probá de nuevo.'

const EXITO = {
  rechazar: 'Cotización rechazada',
  reabrir: 'Cotización reabierta',
  revertir: 'Se revirtió la aprobación',
} as const

function confirmationInitial(
  accion: ActionConfirmable | null | undefined,
  estado: StatusEditor,
  contexto: ContextoStatus,
  pendingList: PendingList,
): Confirmation | null {
  if (!accion) return null
  const { botones, menu } = layoutActions(estado, contexto)
  const disponible = botones.some((button) => button.accion === accion) || menu.includes(accion)
  return disponible && reasonBlock(accion, pendingList) === null ? { tipo: accion } : null
}

/**
 * Las acciones de estado del editor: guardar antes si hace falta, correr la transición con la versión que vio la
 * pantalla, confirmar en el lugar y ofrecer "Recargar" ante un conflicto de versión (decisiones 11 a 15).
 */
export function useQuoteActions({
  estado,
  contexto,
  pendingList,
  hasChangesWithoutSave,
  guardar: save,
  accion,
  setAction,
  conflict,
  setConflict,
  esperarServidor,
  actionInitial,
}: {
  estado: StatusEditor
  contexto: ContextoStatus
  pendingList: PendingList
  hasChangesWithoutSave: boolean
  /**
   * El guardar del editor (Task 8): guarda si hay cambios y devuelve la versión (la actual si no había nada que
   * guardar); null si no se pudo (ya lo mostró) o si la cotización no se edita. Con `navegar: false`, una nueva se
   * crea sin ir a su página; con `avisar: false`, sin el toast de guardado.
   */
  guardar: (options?: { navegar?: boolean; avisar?: boolean }) => Promise<QuoteGuardada | null>
  /** La acción en curso del editor (Task 8): con una en curso se deshabilitan todos los botones. */
  accion: string | null
  setAction: (accion: string | null) => void
  conflict: boolean
  setConflict: (conflict: boolean) => void
  /**
   * Avisa al editor que tome la versión del servidor (null: ya no la espera). 'adoptar' toma la próxima distinta de
   * `versionLocal` y de la que había en `inicial` al llamarlo; 'descartar' toma lo que haya en `inicial` cuando
   * termina el refresco de "Recargar" (`recargando`), sin comparar versiones.
   */
  esperarServidor: (modo: EsperaServidor | null, versionLocal?: string | null) => void
  /** ?accion= de la URL: abre esa confirmación al entrar. */
  actionInitial?: ActionConfirmable | null
}): ActionsStatus {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(() =>
    confirmationInitial(actionInitial, estado, contexto, pendingList),
  )
  const [recargando, iniciarRecarga] = useTransition()
  const [inTransicion, setInTransicion] = useState(false)
  const disparador = useRef<HTMLElement | null>(null)

  // Un cambio de estado de la cotización (enviada, aprobada…, también el que trae la versión de otro) cierra la
  // confirmación abierta: preguntaba por el estado anterior. La oferta de finalizar el presupuesto anterior es la
  // consecuencia de aprobar y se abre justo antes del cambio, así que queda. Se ajusta durante el render.
  const [statusVisto, setStatusVisto] = useState(estado.estado)
  if (estado.estado !== statusVisto) {
    setStatusVisto(estado.estado)
    if (confirmation && confirmation.tipo !== 'finalizar') setConfirmation(null)
  }

  // El ?accion= ya se usó: se saca de la URL para que recargar la página no vuelva a abrir la confirmación.
  useEffect(() => {
    if (actionInitial) window.history.replaceState(null, '', window.location.pathname)
  }, [actionInitial])

  function abrir(nueva: Confirmation) {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmation(nueva)
  }

  function cancelar() {
    const back = disparador.current
    disparador.current = null
    setConfirmation(null)
    // El foco vuelve al botón que abrió la confirmación, si sigue en pantalla.
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus()
    })
  }

  function fallo(message: string) {
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
    esperarServidor(null)
    toast.error(MESSAGE_WITHOUT_RESPONSE)
  }

  /**
   * Guarda lo que haya sin guardar y devuelve el id y la versión con los que seguir (null si no se pudo). Una nueva
   * se guarda sin navegar (decisión 12): la transición usa el id que vuelve y después se va a su página. Sin el toast
   * de guardado: el que avisa es el de la transición (o su error). `guardar()` deja la acción del editor en null al
   * terminar: se vuelve a marcar la que sigue corriendo.
   */
  async function versionForSeguir(propia: string): Promise<{ id: string; version: string } | null> {
    if (!hasChangesWithoutSave && estado.id && estado.version) return { id: estado.id, version: estado.version }
    const guardada = await save({ navegar: false, avisar: false })
    setAction(propia)
    return guardada ? { id: guardada.id, version: guardada.version } : null
  }

  /**
   * Una nueva se guardó sin navegar para seguir con la transición: al terminar (también si la transición falló, ya
   * quedó guardada) va a su página, que arma el editor con lo que hay en la base. Una existente solo se refresca.
   */
  function despuesOfLaTransicion(id: string, eraNew: boolean, salioBien: boolean) {
    if (eraNew) router.replace(`/cotizaciones/${id}`)
    else if (salioBien) router.refresh()
  }

  async function send(accion: 'enviar' | 'reenviar') {
    const eraNew = estado.id === null
    let guardadaId: string | null = null
    setAction(accion)
    setInTransicion(true)
    try {
      const guardada = await versionForSeguir(accion)
      if (!guardada) return
      const { id, version } = guardada
      guardadaId = id
      esperarServidor('adoptar', version)
      const result = await actions.sendQuote(id, version)
      if (!result.ok) {
        esperarServidor(null)
        fallo(result.message)
        return despuesOfLaTransicion(id, eraNew, false)
      }
      downloadFile(`/cotizaciones/${id}/pdf?envio=${result.datos.envioId}&descargar=1`)
      toast.success('Se descargó el PDF y la cotización quedó enviada')
      despuesOfLaTransicion(id, eraNew, true)
    } catch (error) {
      withoutResponse(error)
      if (guardadaId) despuesOfLaTransicion(guardadaId, eraNew, false)
    } finally {
      setAction(null)
      setInTransicion(false)
    }
  }

  /**
   * Se duplica lo guardado. Con `guardarAntes` ("Guardar y duplicar"), lo que hay en pantalla se guarda primero; sin
   * él ("Duplicar lo guardado"), los cambios sin guardar se pierden al ir a la copia.
   */
  async function duplicate(saveAntes: boolean) {
    const id = estado.id
    if (!id) return
    setAction('duplicar')
    setInTransicion(true)
    try {
      if (saveAntes && !(await versionForSeguir('duplicar'))) return
      const result = await actions.duplicateQuote(id)
      if (!result.ok) return fallo(result.message)
      setConfirmation(null)
      toast.success('Se creó una copia en borrador')
      router.push(`/cotizaciones/${result.datos.id}`)
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
      setInTransicion(false)
    }
  }

  function iniciar(accion: ActionStatus) {
    if (isConfirmable(accion)) return abrir({ tipo: accion })
    // Otra acción cierra la confirmación que haya abierta.
    disparador.current = null
    setConfirmation(null)
    if (accion === 'enviar' || accion === 'reenviar') return void send(accion)
    if (accion === 'duplicar') {
      // Con cambios sin guardar se pregunta qué copiar: guardar la original en silencio pisaría, por ejemplo, una
      // enviada con algo que el cliente no recibió.
      if (hasChangesWithoutSave && isEditable(estado)) return abrir({ tipo: 'duplicar' })
      return void duplicate(false)
    }
    if (accion === 'descargar' && estado.id) downloadFile(`/cotizaciones/${estado.id}/pdf?descargar=1`)
  }

  async function approve(fecha: string) {
    const eraNew = estado.id === null
    let guardadaId: string | null = null
    setAction('aprobar')
    setInTransicion(true)
    try {
      const guardada = await versionForSeguir('aprobar')
      if (!guardada) return
      const { id, version } = guardada
      guardadaId = id
      esperarServidor('adoptar', version)
      const result = await actions.approveQuote(id, version, fecha)
      if (!result.ok) {
        esperarServidor(null)
        fallo(result.message)
        return despuesOfLaTransicion(id, eraNew, false)
      }
      toast.success('Cotización aprobada')
      // Una renegociación: se ofrece cerrar el presupuesto que esta reemplaza (decisión 14). Una nueva no reemplaza a
      // ninguna (reemplaza_a solo lo pone duplicar), así que navegar no pierde la oferta.
      const { anterior: previous } = result.datos
      setConfirmation(previous ? { tipo: 'finalizar', anterior: previous } : null)
      despuesOfLaTransicion(id, eraNew, true)
    } catch (error) {
      withoutResponse(error)
      if (guardadaId) despuesOfLaTransicion(guardadaId, eraNew, false)
    } finally {
      setAction(null)
      setInTransicion(false)
    }
  }

  async function confirm() {
    const id = estado.id
    const tipo = confirmation?.tipo
    if (!id || (tipo !== 'rechazar' && tipo !== 'reabrir' && tipo !== 'revertir' && tipo !== 'borrar')) return
    setAction(tipo)
    setInTransicion(true)
    try {
      if (tipo === 'borrar') {
        const result = await actions.removeQuote(id)
        if (!result.ok) return fallo(result.message)
        toast.success(`Se eliminó el borrador N° ${estado.numero}`)
        router.push('/cotizaciones')
        return
      }
      // Una rechazada no se edita: lo que no se guardó se guarda antes de rechazar para no perderlo.
      const version = tipo === 'rechazar' ? (await versionForSeguir('rechazar'))?.version : estado.version
      if (!version) return
      esperarServidor('adoptar', version)
      const result =
        tipo === 'rechazar'
          ? await actions.rejectQuote(id)
          : tipo === 'reabrir'
            ? await actions.reopenQuote(id)
            : await actions.revertApproval(id)
      if (!result.ok) {
        esperarServidor(null)
        return fallo(result.message)
      }
      setConfirmation(null)
      toast.success(EXITO[tipo])
      router.refresh()
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
      setInTransicion(false)
    }
  }

  async function finish() {
    if (confirmation?.tipo !== 'finalizar') return
    const { anterior: previous } = confirmation
    setAction('finalizar')
    try {
      const result = await actions.finishBudget(previous.id)
      if (!result.ok) return fallo(result.message)
      setConfirmation(null)
      toast.success(`Se finalizó el presupuesto N° ${previous.numero}`)
    } catch (error) {
      withoutResponse(error)
    } finally {
      setAction(null)
    }
  }

  function confirmRecarga() {
    // El editor toma lo que haya en `inicial` cuando termina el refresco (`recargando`), sin comparar versiones: una
    // revalidación anterior pudo haber traído ya la del otro usuario, o una intermedia.
    esperarServidor('descartar')
    setConfirmation(null)
    setConflict(false)
    iniciarRecarga(() => router.refresh())
  }

  function recargar() {
    if (hasChangesWithoutSave) return abrir({ tipo: 'recargar' })
    confirmRecarga()
  }

  return {
    inCurso: accion,
    busy: accion !== null || recargando,
    inTransicion,
    recargando,
    confirmation,
    conflict,
    iniciar,
    cancelar,
    aprobar: approve,
    confirm,
    duplicar: duplicate,
    finalizar: finish,
    recargar,
    confirmRecarga,
  }
}
