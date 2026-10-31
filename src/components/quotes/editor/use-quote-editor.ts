'use client'

import { saveQuote } from '@/app/(app)/cotizaciones/actions'
import { isConflict } from '@/lib/quotes/actions-status'
import { NEW_CONTEXT } from '@/lib/quotes/context-status'
import { hasChanges, payloadSave } from '@/lib/quotes/editor/validation'
import { pendingListEditor } from '@/lib/quotes/editor/document'
import { reduceEditor } from '@/lib/quotes/editor/reducer'
import type { ActionEditor, CatalogsEditor, StatusEditor } from '@/lib/quotes/editor/types'
import { errorsOfBlocks, errorsWithoutField, isSaveShortcut, type ErrorsBlock } from '@/lib/quotes/editor-screen'
import { errorsByKey, type ErrorsItem } from '@/lib/quotes/grid'
import { lineViewPreview } from '@/lib/quotes/preview'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ServerUpdateMode, SavedQuote as SavedQuoteVersion } from './quote-actions.types'
import type { QuoteEditorProps } from './quote-editor.types'
import { useQuoteActions } from './use-quote-actions'
import { useQuotePreview } from './use-quote-preview'
import { useSectionDrafts } from './use-section-drafts'

export function useQuoteEditor({
  initial,
  catalogs: initialCatalogs,
  contacts: initialContacts,
  context = NEW_CONTEXT,
  actionInitial = null,
}: QuoteEditorProps) {
  const router = useRouter()
  const [catalogsBase, setCatalogsBase] = useState<CatalogsEditor | null>(null)
  const catalogs = catalogsBase ?? initialCatalogs
  const [preparingPurchaseOrder, setPreparingPurchaseOrder] = useState(false)
  const [state, dispatch] = useReducer(reduceEditor, initial)
  /** Lo último guardado (o lo que vino de la página): contra esto se calculan los cambios. */
  const [saved, setSaved] = useState(initial)
  const [contacts, setContacts] = useState(initialContacts)
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** Los errores de los ítems ('items.N.campo') por clave de ítem (ver mostrarErrores). */
  const [errorsItems, setErrorsItems] = useState<Record<string, ErrorsItem>>({})
  /** Los errores de los bloques de texto ('bloques.N.campo') por clave de bloque, como los de los ítems. */
  const [errorsBlocks, setErrorsBlocks] = useState<Record<string, ErrorsBlock>>({})
  const [warning, setWarning] = useState<string | null>(null)
  const { hasDraftSection, onChangeDraftSection, applySectionDrafts } = useSectionDrafts()
  /** Qué acción corre ('guardar'; la Task 12 suma las suyas). Con una en curso se deshabilitan todas (decisión 12). */
  const [action, setAction] = useState<string | null>(null)
  const inProgress = useRef(false)
  const root = useRef<HTMLDivElement>(null)

  const changes = useMemo(() => hasChanges(saved, state), [saved, state])
  // Un nombre de sección a medio escribir también es un cambio sin guardar: habilita Guardar y el aviso al cerrar
  // la pestaña. Guardar lo aplica antes de leer el estado (applySectionDrafts).
  const withoutSave = changes || hasDraftSection
  const pendingList = useMemo(() => pendingListEditor(state, catalogs), [state, catalogs])
  const editable = state.origen === 'app' && (state.estado === 'borrador' || state.estado === 'enviada')
  const unassignedErrors = errorsWithoutField(errors)
  /** Otro guardó mientras tanto: franja con "Recargar" (Task 12). */
  const [conflict, setConflict] = useState(false)

  /**
   * El editor espera la versión del servidor que va a llegar en `initial` (ver la adopción, después del hook de
   * acciones). Después de una transición se ignoran la versión que había al empezar y la que dejó el guardado previo,
   * que pueden llegar antes que la nueva. "Recargar" no compara versiones: toma lo que haya cuando termina el refresco.
   */
  const [serverUpdate, setServerUpdate] = useState<{ mode: 'adoptar'; ignoredVersions: (string | null)[] } | { mode: 'descartar' } | null>(
    null,
  )
  function awaitServerUpdate(mode: ServerUpdateMode | null, localVersion: string | null = null) {
    if (!mode) return setServerUpdate(null)
    setServerUpdate(mode === 'descartar' ? { mode } : { mode, ignoredVersions: [initial.version, localVersion] })
  }

  // Vista previa (Task 11): un solo estado para la columna fija (≥ 90rem) y el panel lateral (md a 90rem).
  const view = useQuotePreview(state)
  const lineView = lineViewPreview({
    modo: view.mode,
    estado: state.estado,
    origen: state.origen,
    desactualizada: view.outdated,
    lastSend: context.envios[0]?.enviada_at ?? null,
    dateApproval: context.dateApproval,
  })

  /**
   * Muestra los errores de un guardado. Los de los ítems y los bloques llegan por posición ('items.2.precio',
   * 'bloques.1.contenido') en lo que se mandó: se pasan acá a la clave de cada ítem o bloque enviado (no a la de la
   * lista que haya cuando vuelve la respuesta), así la marca queda en el que la tuvo aunque mientras se guardaba o
   * después se agreguen, muevan o borren otros.
   */
  function showErrors(message: string, next: Record<string, string>, sent: StatusEditor) {
    setWarning(message)
    setErrors(next)
    setErrorsItems(
      errorsByKey(
        next,
        sent.items.map((item) => item.clave),
      ),
    )
    setErrorsBlocks(
      errorsOfBlocks(
        next,
        sent.bloques.map((block) => block.clave),
      ),
    )
  }

  /**
   * Guarda y devuelve la versión nueva; null si no se pudo (el motivo queda a la vista). Antes aplica los nombres de
   * sección a medio escribir y guarda con el estado del render que eso deja (saveCurrent). En una ya guardada y sin
   * cambios no llama al servidor y devuelve la versión actual (las transiciones de la Task 12 guardan primero).
   * Al crear navega a /cotizaciones/{id}; con `navigate: false` no: enviar y aprobar una nueva (Task 12) guardan,
   * hacen la transición con el id que vuelve y navegan después (decisión 12). Con `notify: false` no muestra el
   * toast de guardado: cuando guarda antes de una transición, el aviso es el de la transición (no dos apilados).
   */
  function save(options: { navigate?: boolean; notify?: boolean } = {}): Promise<SavedQuoteVersion | null> {
    applySectionDrafts()
    return saveCurrent.current(options)
  }

  async function saveStatus({
    navigate = true,
    notify = true,
  }: { navigate?: boolean; notify?: boolean } = {}): Promise<SavedQuoteVersion | null> {
    if (!editable || inProgress.current) return null
    if (state.id !== null && state.version !== null && state.numero !== null && !changes) {
      return { id: state.id, version: state.version, numero: state.numero }
    }
    const sent = state
    const validation = payloadSave(sent)
    if (!validation.ok) {
      showErrors('Revisá los datos marcados', validation.errors, sent)
      return null
    }
    inProgress.current = true
    setAction('guardar')
    try {
      const result = await saveQuote(sent)
      if (!result.ok) {
        // Otro guardó antes: no es un error de los datos, se ofrece "Recargar" (Task 12) sin tocar lo escrito.
        if (isConflict(result.message)) {
          setConflict(true)
          return null
        }
        showErrors(result.message, result.errors ?? {}, sent)
        return null
      }
      setConflict(false)
      const { id, version, numero: number } = result.datos
      const savedNow: ActionEditor = { tipo: 'guardado', id, version, numero: number }
      // Lo que se mandó pasa a ser lo guardado; lo tipeado mientras tanto sigue contando como cambio.
      setSaved(reduceEditor(sent, savedNow))
      dispatch(savedNow)
      setErrors({})
      setErrorsItems({})
      setErrorsBlocks({})
      setWarning(null)
      if (notify) toast.success(sent.id === null ? `Cotización N° ${number} creada` : 'Cotización guardada')
      // replace: "Atrás" no vuelve a una cotización nueva vacía (decisión 8).
      if (sent.id === null && navigate) router.replace(`/cotizaciones/${id}`)
      return result.datos
    } catch (error) {
      unstable_rethrow(error)
      showErrors('No se pudo guardar. Probá de nuevo en un momento.', {}, sent)
      return null
    } finally {
      inProgress.current = false
      setAction(null)
    }
  }

  // guardar llama al saveStatus del último render: después de aplicar los borradores, el que ve los nombres nuevos.
  const saveCurrent = useRef(saveStatus)
  useLayoutEffect(() => {
    saveCurrent.current = saveStatus
  })

  /**
   * Para el celular, antes de abrir la pestaña de la vista previa: si lo que hay no pasa la validación local, marca
   * los campos y avisa con un toast (la barra de abajo tapa el aviso de arriba). true si se puede seguir.
   */
  function validateForPreview(): boolean {
    const validation = payloadSave(state)
    if (validation.ok) return true
    showErrors('Revisá los datos marcados', validation.errors, state)
    toast.error('Revisá los datos marcados')
    return false
  }

  /** Para el celular: guarda si hace falta y devuelve el id de lo guardado (null si no se pudo). */
  async function saveForPreview(): Promise<string | null> {
    const savedQuote = await save()
    return savedQuote?.id ?? null
  }

  // Acciones de estado (Task 12): con una en curso se deshabilitan todos los botones, Guardar incluido.
  const actions = useQuoteActions({
    state,
    context,
    pendingList,
    hasChangesWithoutSave: withoutSave,
    save,
    action: preparingPurchaseOrder ? 'preparar_oc' : action,
    setAction,
    conflict,
    setConflict,
    awaitServerUpdate,
    actionInitial,
  })
  const busy = actions.busy || preparingPurchaseOrder

  // Después de una transición (o de "Recargar") el servidor manda otra versión en `initial`: el editor la toma. Se
  // ajusta durante el render (como recomienda React para un estado que depende de una prop), no en un efecto.
  // "Recargar" toma `initial` cuando termina el refresco, sin comparar versiones: cualquier acción que revalida (el
  // alta rápida de un cliente, por ejemplo) vuelve a dibujar la página, así que `initial` puede traer antes la versión
  // del otro usuario o una intermedia (si después volvió a guardar); tomarla en cuanto difiere de la local ignoraría
  // la del refresco, que es la actual.
  const serverVersionArrived =
    serverUpdate?.mode === 'descartar'
      ? !actions.reloading
      : serverUpdate !== null && initial.version !== null && !serverUpdate.ignoredVersions.includes(initial.version)
  if (serverUpdate && serverVersionArrived) {
    // Recargar descarta lo local. Después de una transición, lo que se haya tipeado mientras corría queda encima del
    // estado y la versión nuevos.
    const adopted =
      serverUpdate.mode === 'descartar' || !changes
        ? initial
        : { ...state, estado: initial.estado, version: initial.version }
    setServerUpdate(null)
    setSaved(initial)
    dispatch({ tipo: 'reemplazar', estado: adopted })
    // Los contactos son los del cliente del estado tomado: los de `initial` (la página los vuelve a leer en cada
    // render), salvo que lo local que queda encima tenga otro cliente: ahí siguen los de ese, que son los que hay.
    if (adopted.cliente?.id === initial.cliente?.id) setContacts(initialContacts)
    // Lo que marcaba la versión anterior (errores, aviso, conflicto) no corresponde a la que se toma.
    setErrors({})
    setErrorsItems({})
    setErrorsBlocks({})
    setWarning(null)
    setConflict(false)
  }

  // Con errores, el foco va al primer campo marcado (como ActionForm). Si los dejó el guardado previo a una
  // transición, el contenido sigue deshabilitado hasta que la transición termina: el foco espera a ese momento.
  const errorAwaitingFocus = useRef(false)
  useEffect(() => {
    if (Object.keys(errors).length > 0) errorAwaitingFocus.current = true
  }, [errors])
  useEffect(() => {
    if (!errorAwaitingFocus.current || actions.transitioning) return
    errorAwaitingFocus.current = false
    root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors, actions.transitioning])

  // Ctrl/⌘+S guarda (y nunca abre el "Guardar como…" del navegador). Con una acción en curso (guardar, una de estado
  // o la recarga) no hace nada, igual que el botón deshabilitado (decisión 12): guardar cambiaría la versión que esa
  // acción ya mandó.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isSaveShortcut(event)) {
      event.preventDefault()
      if (!busy) void save()
    }
  })
  useEffect(() => {
    const listen = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación al navegador.
  useEffect(() => {
    if (!withoutSave) return
    const notify = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', notify)
    return () => window.removeEventListener('beforeunload', notify)
  }, [withoutSave])

  async function preparePurchaseOrder() {
    if (preparingPurchaseOrder) return
    setPreparingPurchaseOrder(true)
    try {
      const savedQuote = await save({ navigate: false, notify: false })
      if (savedQuote)
        router.push(
          `/documentos/nuevo?cotizacion=${savedQuote.id}&tipo=orden_compra&version=${encodeURIComponent(savedQuote.version)}`,
        )
      else setPreparingPurchaseOrder(false)
    } catch (error) {
      setPreparingPurchaseOrder(false)
      unstable_rethrow(error)
      toast.error('No se pudo preparar la orden de compra')
    }
  }

  return {
    state,
    catalogs,
    contacts,
    errors,
    errorsItems,
    errorsBlocks,
    warning,
    unassignedErrors,
    changes,
    withoutSave,
    pendingList,
    editable,
    preparingPurchaseOrder,
    action,
    busy,
    actions,
    view,
    lineView,
    root,
    save,
    applySectionDrafts,
    validateForPreview,
    saveForPreview,
    dispatch,
    setContacts,
    setCatalogsBase,
    onChangeDraftSection,
    preparePurchaseOrder,
  }
}
