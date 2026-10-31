'use client'
// src/components/cotizaciones/editor/acciones-editor.tsx

import { Ellipsis, FileText } from 'lucide-react'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import * as actions from '@/app/(app)/cotizaciones/actions'
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
  layoutActions,
  isConfirmable,
  isConflict,
  isEditable,
  LABEL_ACTION,
  LABEL_IN_CURSO,
  dateTimeOfMark,
  reasonBlock,
  type ActionConfirmable,
  type ActionStatus,
  type ButtonAction,
} from '@/lib/quotes/actions-status'
import type { ContextoStatus } from '@/lib/quotes/context-status'
import type { StatusEditor, PendingList } from '@/lib/quotes/editor'
import { cn } from '@/lib/utils'

export type Confirmation =
  | { tipo: ActionConfirmable }
  | { tipo: 'recargar' }
  | { tipo: 'finalizar'; anterior: { id: string; numero: number } }
  /** Duplicar con cambios sin guardar: guardarlos antes o copiar lo guardado. */
  | { tipo: 'duplicar' }

/** Qué hace el editor cuando llega la versión nueva del servidor: tomarla (después de una transición) o descartar lo local (Recargar). */
export type EsperaServidor = 'adoptar' | 'descartar'

/** Lo que devuelve el guardar del editor (VersionGuardada de la Task 8). */
export type QuoteGuardada = { id: string; version: string; numero: number }

export type ActionsStatus = {
  /** La acción que corre (la `accion` del editor: 'guardar' o una de estas). */
  inCurso: string | null
  /** Corre una acción (o una recarga): todos los botones de acción quedan deshabilitados (decisión 12). */
  busy: boolean
  /**
   * Corre una transición (también su guardado previo): el contenido del editor queda deshabilitado, así no se tipea
   * sobre algo que se está enviando, aprobando o rechazando.
   */
  inTransicion: boolean
  /** Corre el refresco de "Recargar": al terminar, el editor toma lo que haya en `inicial`. */
  recargando: boolean
  confirmation: Confirmation | null
  conflict: boolean
  iniciar: (accion: ActionStatus) => void
  cancelar: () => void
  aprobar: (fecha: string) => Promise<void>
  /** Confirma rechazar, reabrir, revertir o eliminar. */
  confirm: () => Promise<void>
  /** Duplica; con `guardarAntes`, guarda primero lo que hay en pantalla. */
  duplicar: (saveAntes: boolean) => Promise<void>
  finalizar: () => Promise<void>
  recargar: () => void
  confirmRecarga: () => void
}

/** Descarga sin navegar (el atributo download evita salir del editor): el nombre lo pone la ruta del PDF. */
export function downloadFile(url: string) {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}

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
export function useActionsStatus({
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
