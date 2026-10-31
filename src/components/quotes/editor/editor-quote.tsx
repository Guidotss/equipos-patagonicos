'use client'
// src/components/cotizaciones/editor/editor-cotizacion.tsx

import { unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { saveQuote } from '@/app/(app)/cotizaciones/actions'
import { Content } from '@/components/app-shell/header'
import { SaveTemplate } from '@/components/quotes/specials/save-template'
import { SheetForm } from '@/components/form/structure-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isConflict, type ActionConfirmable } from '@/lib/quotes/actions-status'
import { CONTEXTO_NEW, type ContextoStatus } from '@/lib/quotes/context-status'
import {
  hasChanges,
  payloadSave,
  pendingListEditor,
  reduceEditor,
  type ActionEditor,
  type CatalogsEditor,
  type StatusEditor,
} from '@/lib/quotes/editor'
import {
  errorsOfBlocks,
  errorsWithoutField,
  isAtajoSave,
  type ContactEditor,
  type ErrorsBlock,
} from '@/lib/quotes/editor-screen'
import { errorsByKey, type ErrorsItem } from '@/lib/quotes/grid'
import { lineViewPreview } from '@/lib/quotes/preview'
import { ActionsHeader, useActionsStatus, type EsperaServidor } from './actions-editor'
import { BarBottom } from './bar-bottom'
import { HeaderEditor } from './header-editor'
import { BandsEditor } from './bands-editor'
import { ButtonViewPreviewCelular, ColumnViewPreview, useViewPreview, ViewPreviewLateral } from './panel-preview'
import { CardSubject } from './card-subject'
import { CardClient } from './card-client'
import { CardData } from './card-data'
import { CardItems } from './card-items'
import { CardTexts } from './card-texts'

export type VersionGuardada = { id: string; version: string; numero: number }

export function EditorQuote({
  initial,
  catalogs: catalogsIniciales,
  contactos: contactsIniciales,
  today,
  contexto = CONTEXTO_NEW,
  actionInitial = null,
}: {
  initial: StatusEditor
  catalogs: CatalogsEditor
  /** Contactos del cliente de `inicial` (vacío en una nueva). */
  contactos: ContactEditor[]
  /** Hoy en Argentina ('YYYY-MM-DD'), calculado en el servidor. */
  today: string
  /** Envíos, vencimiento, aprobación y anterior (leerContextoEstado). Una nueva no tiene. */
  contexto?: ContextoStatus
  /** ?accion= de la URL: abre esa confirmación al entrar (la página la lee con accionDesdeParametro). */
  actionInitial?: ActionConfirmable | null
}) {
  const router = useRouter()
  const [catalogsBase, setCatalogsBase] = useState<CatalogsEditor | null>(null)
  const catalogs = catalogsBase ?? catalogsIniciales
  const [preparandoOc, setPreparandoOc] = useState(false)
  const [estado, despachar] = useReducer(reduceEditor, initial)
  /** Lo último guardado (o lo que vino de la página): contra esto se calculan los cambios. */
  const [saved, setSaved] = useState(initial)
  const [contactos, setContacts] = useState(contactsIniciales)
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** Los errores de los ítems ('items.N.campo') por clave de ítem (ver mostrarErrores). */
  const [errorsItems, setErrorsItems] = useState<Record<string, ErrorsItem>>({})
  /** Los errores de los bloques de texto ('bloques.N.campo') por clave de bloque, como los de los ítems. */
  const [errorsBlocks, setErrorsBlocks] = useState<Record<string, ErrorsBlock>>({})
  const [warning, setWarning] = useState<string | null>(null)
  /** Secciones de la grilla con el nombre escrito y todavía no aplicado (borrador local de TarjetaItems). */
  const [borradoresSection, setBorradoresSection] = useState<ReadonlySet<string>>(() => new Set())
  /** El `aplicar` de cada uno de esos borradores, por clave de sección: guardar los aplica antes de leer el estado. */
  const applyDraft = useRef(new Map<string, () => void>())
  /** Qué acción corre ('guardar'; la Task 12 suma las suyas). Con una en curso se deshabilitan todas (decisión 12). */
  const [accion, setAction] = useState<string | null>(null)
  const inCurso = useRef(false)
  const raiz = useRef<HTMLDivElement>(null)

  const changes = useMemo(() => hasChanges(saved, estado), [saved, estado])
  // Un nombre de sección a medio escribir también es un cambio sin guardar: habilita Guardar y el aviso al cerrar
  // la pestaña. Guardar lo aplica antes de leer el estado (aplicarBorradoresSeccion).
  const hasDraftSection = borradoresSection.size > 0
  const withoutSave = changes || hasDraftSection
  const pendingList = useMemo(() => pendingListEditor(estado, catalogs), [estado, catalogs])
  const editable = estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
  const sueltos = errorsWithoutField(errors)
  /** Otro guardó mientras tanto: franja con "Recargar" (Task 12). */
  const [conflict, setConflict] = useState(false)

  /**
   * El editor espera la versión del servidor que va a llegar en `inicial` (ver la adopción, después del hook de
   * acciones). Después de una transición se ignoran la versión que había al empezar y la que dejó el guardado previo,
   * que pueden llegar antes que la nueva. "Recargar" no compara versiones: toma lo que haya cuando termina el refresco.
   */
  const [espera, setEspera] = useState<
    { modo: 'adoptar'; ignorar: (string | null)[] } | { modo: 'descartar' } | null
  >(null)
  function esperarServidor(modo: EsperaServidor | null, versionLocal: string | null = null) {
    if (!modo) return setEspera(null)
    setEspera(modo === 'descartar' ? { modo } : { modo, ignorar: [initial.version, versionLocal] })
  }

  // Vista previa (Task 11): un solo estado para la columna fija (≥ 90rem) y el panel lateral (md a 90rem).
  const view = useViewPreview(estado)
  const lineView = lineViewPreview({
    modo: view.modo,
    estado: estado.estado,
    origen: estado.origen,
    desactualizada: view.desactualizada,
    lastSend: contexto.envios[0]?.enviada_at ?? null,
    dateApproval: contexto.dateApproval,
  })

  const onChangeDraftSection = useCallback((clave: string, apply: (() => void) | null) => {
    if (apply) applyDraft.current.set(clave, apply)
    else applyDraft.current.delete(clave)
    const has = apply !== null
    setBorradoresSection((actuales) => {
      if (actuales.has(clave) === has) return actuales
      const nuevos = new Set(actuales)
      if (has) nuevos.add(clave)
      else nuevos.delete(clave)
      return nuevos
    })
  }, [])

  /**
   * Muestra los errores de un guardado. Los de los ítems y los bloques llegan por posición ('items.2.precio',
   * 'bloques.1.contenido') en lo que se mandó: se pasan acá a la clave de cada ítem o bloque enviado (no a la de la
   * lista que haya cuando vuelve la respuesta), así la marca queda en el que la tuvo aunque mientras se guardaba o
   * después se agreguen, muevan o borren otros.
   */
  function showErrors(message: string, nuevos: Record<string, string>, sent: StatusEditor) {
    setWarning(message)
    setErrors(nuevos)
    setErrorsItems(errorsByKey(nuevos, sent.items.map((item) => item.clave)))
    setErrorsBlocks(errorsOfBlocks(nuevos, sent.bloques.map((block) => block.clave)))
  }

  /**
   * Aplica ya los nombres de sección a medio escribir (renderizados con flushSync), de forma explícita: no depende de
   * que el blur del campo llegue antes que el click de Guardar (no está verificado en Safari ni en iOS) ni del orden
   * de los keydown en Ctrl/⌘+S.
   */
  function applyBorradoresSection() {
    const byApply = [...applyDraft.current.values()]
    if (byApply.length === 0) return
    flushSync(() => {
      for (const apply of byApply) apply()
    })
  }

  /**
   * Guarda y devuelve la versión nueva; null si no se pudo (el motivo queda a la vista). Antes aplica los nombres de
   * sección a medio escribir y guarda con el estado del render que eso deja (guardarActual). En una ya guardada y sin
   * cambios no llama al servidor y devuelve la versión actual (las transiciones de la Task 12 guardan primero).
   * Al crear navega a /cotizaciones/{id}; con `navegar: false` no: enviar y aprobar una nueva (Task 12) guardan,
   * hacen la transición con el id que vuelve y navegan después (decisión 12). Con `avisar: false` no muestra el
   * toast de guardado: cuando guarda antes de una transición, el aviso es el de la transición (no dos apilados).
   */
  function save(options: { navegar?: boolean; avisar?: boolean } = {}): Promise<VersionGuardada | null> {
    applyBorradoresSection()
    return saveCurrent.current(options)
  }

  async function saveStatus({
    navegar = true,
    avisar = true,
  }: { navegar?: boolean; avisar?: boolean } = {}): Promise<VersionGuardada | null> {
    if (!editable || inCurso.current) return null
    if (estado.id !== null && estado.version !== null && estado.numero !== null && !changes) {
      return { id: estado.id, version: estado.version, numero: estado.numero }
    }
    const sent = estado
    const validation = payloadSave(sent)
    if (!validation.ok) {
      showErrors('Revisá los datos marcados', validation.errors, sent)
      return null
    }
    inCurso.current = true
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
      const { id, version, numero } = result.datos
      const savedNow: ActionEditor = { tipo: 'guardado', id, version, numero }
      // Lo que se mandó pasa a ser lo guardado; lo tipeado mientras tanto sigue contando como cambio.
      setSaved(reduceEditor(sent, savedNow))
      despachar(savedNow)
      setErrors({})
      setErrorsItems({})
      setErrorsBlocks({})
      setWarning(null)
      if (avisar) toast.success(sent.id === null ? `Cotización N° ${numero} creada` : 'Cotización guardada')
      // replace: "Atrás" no vuelve a una cotización nueva vacía (decisión 8).
      if (sent.id === null && navegar) router.replace(`/cotizaciones/${id}`)
      return result.datos
    } catch (error) {
      unstable_rethrow(error)
      showErrors('No se pudo guardar. Probá de nuevo en un momento.', {}, sent)
      return null
    } finally {
      inCurso.current = false
      setAction(null)
    }
  }

  // guardar llama al guardarEstado del último render: después de aplicar los borradores, el que ve los nombres nuevos.
  const saveCurrent = useRef(saveStatus)
  useLayoutEffect(() => {
    saveCurrent.current = saveStatus
  })

  /**
   * Para el celular, antes de abrir la pestaña de la vista previa: si lo que hay no pasa la validación local, marca
   * los campos y avisa con un toast (la barra de abajo tapa el aviso de arriba). true si se puede seguir.
   */
  function validateForVer(): boolean {
    const validation = payloadSave(estado)
    if (validation.ok) return true
    showErrors('Revisá los datos marcados', validation.errors, estado)
    toast.error('Revisá los datos marcados')
    return false
  }

  /** Para el celular: guarda si hace falta y devuelve el id de lo guardado (null si no se pudo). */
  async function saveForVer(): Promise<string | null> {
    const guardada = await save()
    return guardada?.id ?? null
  }

  // Acciones de estado (Task 12): con una en curso se deshabilitan todos los botones, Guardar incluido.
  const actions = useActionsStatus({
    estado,
    contexto,
    pendingList,
    hasChangesWithoutSave: withoutSave,
    guardar: save,
    accion: preparandoOc ? 'preparar_oc' : accion,
    setAction,
    conflict,
    setConflict,
    esperarServidor,
    actionInitial,
  })
  const busy = actions.busy || preparandoOc

  // Después de una transición (o de "Recargar") el servidor manda otra versión en `inicial`: el editor la toma. Se
  // ajusta durante el render (como recomienda React para un estado que depende de una prop), no en un efecto.
  // "Recargar" toma `inicial` cuando termina el refresco, sin comparar versiones: cualquier acción que revalida (el
  // alta rápida de un cliente, por ejemplo) vuelve a dibujar la página, así que `inicial` puede traer antes la versión
  // del otro usuario o una intermedia (si después volvió a guardar); tomarla en cuanto difiere de la local ignoraría
  // la del refresco, que es la actual.
  const llegoLaVersion =
    espera?.modo === 'descartar'
      ? !actions.recargando
      : espera !== null && initial.version !== null && !espera.ignorar.includes(initial.version)
  if (espera && llegoLaVersion) {
    // Recargar descarta lo local. Después de una transición, lo que se haya tipeado mientras corría queda encima del
    // estado y la versión nuevos.
    const tomado =
      espera.modo === 'descartar' || !changes ? initial : { ...estado, estado: initial.estado, version: initial.version }
    setEspera(null)
    setSaved(initial)
    despachar({ tipo: 'reemplazar', estado: tomado })
    // Los contactos son los del cliente del estado tomado: los de `inicial` (la página los vuelve a leer en cada
    // render), salvo que lo local que queda encima tenga otro cliente: ahí siguen los de ese, que son los que hay.
    if (tomado.cliente?.id === initial.cliente?.id) setContacts(contactsIniciales)
    // Lo que marcaba la versión anterior (errores, aviso, conflicto) no corresponde a la que se toma.
    setErrors({})
    setErrorsItems({})
    setErrorsBlocks({})
    setWarning(null)
    setConflict(false)
  }

  // Con errores, el foco va al primer campo marcado (como FormularioAccion). Si los dejó el guardado previo a una
  // transición, el contenido sigue deshabilitado hasta que la transición termina: el foco espera a ese momento.
  const errorByEnfocar = useRef(false)
  useEffect(() => {
    if (Object.keys(errors).length > 0) errorByEnfocar.current = true
  }, [errors])
  useEffect(() => {
    if (!errorByEnfocar.current || actions.inTransicion) return
    errorByEnfocar.current = false
    raiz.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors, actions.inTransicion])

  // Ctrl/⌘+S guarda (y nunca abre el "Guardar como…" del navegador). Con una acción en curso (guardar, una de estado
  // o la recarga) no hace nada, igual que el botón deshabilitado (decisión 12): guardar cambiaría la versión que esa
  // acción ya mandó.
  const onTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if (isAtajoSave(evento)) {
      evento.preventDefault()
      if (!busy) void save()
    }
  })
  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => onTeclear(evento)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación al navegador.
  useEffect(() => {
    if (!withoutSave) return
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [withoutSave])

  return (
    <div ref={raiz}>
      <Content className="pb-28 min-[90rem]:pb-8">
        <HeaderEditor
          estado={estado}
          today={today}
          editable={editable}
          changes={withoutSave}
          guardando={accion === 'guardar'}
          busy={busy}
          onSave={() => void save()}
          actions={<><SaveTemplate estado={estado} disabled={busy} antesOfAbrir={applyBorradoresSection} /><ActionsHeader estado={estado} contexto={contexto} pendingList={pendingList} actions={actions} /></>}
        />
        <BandsEditor
          estado={estado}
          contexto={contexto}
          pendingList={pendingList}
          actions={actions}
          hasChangesWithoutSave={changes}
          today={today}
        />
        {estado.id && estado.estado === 'enviada' ? <div className="mb-4"><Button type="button" variant="outline" disabled={busy} onClick={async () => {
          if (preparandoOc) return
          setPreparandoOc(true)
          try {
            const guardada = await save({ navegar: false, avisar: false })
            if (guardada) router.push(`/documentos/nuevo?cotizacion=${guardada.id}&tipo=orden_compra&version=${encodeURIComponent(guardada.version)}`)
            else setPreparandoOc(false)
          } catch (error) { setPreparandoOc(false); unstable_rethrow(error); toast.error('No se pudo preparar la orden de compra') }
        }}>Aprobar y cargar orden de compra</Button></div> : null}
        {warning ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{warning}</p>
              {sueltos.length ? (
                <ul className="list-disc pl-5">
                  {sueltos.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid items-start gap-5 min-[90rem]:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          {/* Aprobada o rechazada: todo de solo lectura, pero legible (sin la opacidad de :disabled). Mientras corre
              una transición, también: no se tipea sobre algo que se está enviando, aprobando o rechazando. */}
          <fieldset
            disabled={!editable || actions.inTransicion || preparandoOc}
            className="min-w-0 [&_:disabled]:opacity-100! [&_[data-slot=native-select-wrapper]]:opacity-100!"
          >
            <legend className="sr-only">Contenido de la cotización</legend>
            <SheetForm>
              <CardClient
                estado={estado}
                contactos={contactos}
                errors={errors}
                despachar={despachar}
                onChangeContacts={setContacts}
                onChangeCatalogs={setCatalogsBase}
              />
              <CardData
                estado={estado}
                catalogs={catalogs}
                pendingList={pendingList}
                errors={errors}
                despachar={despachar}
              />
              <CardSubject estado={estado} errors={errors} despachar={despachar} />
              <CardItems
                items={estado.items}
                formato={estado.formato}
                mostrarTotal={estado.mostrarTotal}
                errors={errorsItems}
                despachar={despachar}
                onChangeDraftSection={onChangeDraftSection}
              />
              <CardTexts
                bloques={estado.bloques}
                plantilla={catalogs.plantillas.find((template) => template.id === estado.templateId) ?? null}
                errors={errorsBlocks}
                despachar={despachar}
              />
            </SheetForm>
          </fieldset>
          <ColumnViewPreview view={view} line={lineView} />
        </div>
      </Content>
      <BarBottom
        editable={editable}
        isNew={estado.id === null}
        changes={withoutSave}
        guardando={accion === 'guardar'}
        busy={busy}
        onSave={() => void save()}
        viewPreview={
          <>
            <ViewPreviewLateral view={view} line={lineView} />
            <ButtonViewPreviewCelular
              modo={view.modo}
              busy={busy}
              validate={validateForVer}
              saveForVer={saveForVer}
            />
          </>
        }
      />
    </div>
  )
}
