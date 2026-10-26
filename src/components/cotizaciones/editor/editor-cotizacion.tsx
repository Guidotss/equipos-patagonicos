'use client'
// src/components/cotizaciones/editor/editor-cotizacion.tsx

import { unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { guardarCotizacion } from '@/app/(app)/cotizaciones/actions'
import { Contenido } from '@/components/app-shell/encabezado'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { esConflicto, type AccionConfirmable } from '@/lib/cotizaciones/acciones-estado'
import { CONTEXTO_NUEVA, type ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import {
  hayCambios,
  payloadGuardar,
  pendientesEditor,
  reducirEditor,
  type AccionEditor,
  type CatalogosEditor,
  type EstadoEditor,
} from '@/lib/cotizaciones/editor'
import { erroresSinCampo, esAtajoGuardar, type ContactoEditor } from '@/lib/cotizaciones/editor-pantalla'
import { erroresPorClave, type ErroresItem } from '@/lib/cotizaciones/grilla'
import { lineaVistaPrevia } from '@/lib/cotizaciones/vista-previa'
import { AccionesEncabezado, useAccionesEstado, type EsperaServidor } from './acciones-editor'
import { BarraInferior } from './barra-inferior'
import { EncabezadoEditor } from './encabezado-editor'
import { FranjasEditor } from './franjas-editor'
import { BotonVistaPreviaCelular, ColumnaVistaPrevia, useVistaPrevia, VistaPreviaLateral } from './panel-vista-previa'
import { TarjetaAsunto } from './tarjeta-asunto'
import { TarjetaCliente } from './tarjeta-cliente'
import { TarjetaDatos } from './tarjeta-datos'
import { TarjetaItems } from './tarjeta-items'
import { TarjetaTextos } from './tarjeta-textos'

export type VersionGuardada = { id: string; version: string; numero: number }

export function EditorCotizacion({
  inicial,
  catalogos,
  contactos: contactosIniciales,
  hoy,
  contexto = CONTEXTO_NUEVA,
  accionInicial = null,
}: {
  inicial: EstadoEditor
  catalogos: CatalogosEditor
  /** Contactos del cliente de `inicial` (vacío en una nueva). */
  contactos: ContactoEditor[]
  /** Hoy en Argentina ('YYYY-MM-DD'), calculado en el servidor. */
  hoy: string
  /** Envíos, vencimiento, aprobación y anterior (leerContextoEstado). Una nueva no tiene. */
  contexto?: ContextoEstado
  /** ?accion= de la URL: abre esa confirmación al entrar (la página la lee con accionDesdeParametro). */
  accionInicial?: AccionConfirmable | null
}) {
  const router = useRouter()
  const [estado, despachar] = useReducer(reducirEditor, inicial)
  /** Lo último guardado (o lo que vino de la página): contra esto se calculan los cambios. */
  const [guardado, setGuardado] = useState(inicial)
  const [contactos, setContactos] = useState(contactosIniciales)
  const [errores, setErrores] = useState<Record<string, string>>({})
  /** Los errores de los ítems ('items.N.campo') por clave de ítem (ver mostrarErrores). */
  const [erroresItems, setErroresItems] = useState<Record<string, ErroresItem>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  /** Secciones de la grilla con el nombre escrito y todavía no aplicado (borrador local de TarjetaItems). */
  const [borradoresSeccion, setBorradoresSeccion] = useState<ReadonlySet<string>>(() => new Set())
  /** Qué acción corre ('guardar'; la Task 12 suma las suyas). Con una en curso se deshabilitan todas (decisión 12). */
  const [accion, setAccion] = useState<string | null>(null)
  const enCurso = useRef(false)
  const raiz = useRef<HTMLDivElement>(null)

  const cambios = useMemo(() => hayCambios(guardado, estado), [guardado, estado])
  // Un nombre de sección a medio escribir también es un cambio sin guardar: habilita Guardar y el aviso al cerrar
  // la pestaña. Guardar lo aplica antes de leer el estado (el blur del clic, o el atajo con flushSync).
  const hayBorradorSeccion = borradoresSeccion.size > 0
  const sinGuardar = cambios || hayBorradorSeccion
  const pendientes = useMemo(() => pendientesEditor(estado, catalogos), [estado, catalogos])
  const editable = estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
  const sueltos = erroresSinCampo(errores)
  /** Otro guardó mientras tanto: franja con "Recargar" (Task 12). */
  const [conflicto, setConflicto] = useState(false)

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
    setEspera(modo === 'descartar' ? { modo } : { modo, ignorar: [inicial.version, versionLocal] })
  }

  // Vista previa (Task 11): un solo estado para la columna fija (≥ 72rem) y el panel lateral (md a 72rem).
  const vista = useVistaPrevia(estado)
  const lineaVista = lineaVistaPrevia({
    modo: vista.modo,
    estado: estado.estado,
    origen: estado.origen,
    desactualizada: vista.desactualizada,
    ultimoEnvio: contexto.envios[0]?.enviada_at ?? null,
    fechaAprobacion: contexto.fechaAprobacion,
  })

  const alCambiarBorradorSeccion = useCallback((clave: string, hay: boolean) => {
    setBorradoresSeccion((actuales) => {
      if (actuales.has(clave) === hay) return actuales
      const nuevos = new Set(actuales)
      if (hay) nuevos.add(clave)
      else nuevos.delete(clave)
      return nuevos
    })
  }, [])

  /**
   * Muestra los errores de un guardado. Los de los ítems llegan por posición ('items.2.precio') en lo que se mandó:
   * se pasan acá a la clave de cada ítem enviado (no a la de la lista que haya cuando vuelve la respuesta), así la
   * marca queda en el ítem que la tuvo aunque mientras se guardaba o después se agreguen, muevan o borren otros.
   */
  function mostrarErrores(mensaje: string, nuevos: Record<string, string>, enviado: EstadoEditor) {
    setAviso(mensaje)
    setErrores(nuevos)
    setErroresItems(erroresPorClave(nuevos, enviado.items.map((item) => item.clave)))
  }

  /**
   * Guarda y devuelve la versión nueva; null si no se pudo (el motivo queda a la vista). En una ya guardada y sin
   * cambios no llama al servidor y devuelve la versión actual (las transiciones de la Task 12 guardan primero).
   * Al crear navega a /cotizaciones/{id}; con `navegar: false` no: enviar y aprobar una nueva (Task 12) guardan,
   * hacen la transición con el id que vuelve y navegan después (decisión 12). Con `avisar: false` no muestra el
   * toast de guardado: cuando guarda antes de una transición, el aviso es el de la transición (dos toasts apilados
   * arriba a la derecha tapan los botones del encabezado y, con el puntero encima, no se van).
   */
  async function guardar({
    navegar = true,
    avisar = true,
  }: { navegar?: boolean; avisar?: boolean } = {}): Promise<VersionGuardada | null> {
    if (!editable || enCurso.current) return null
    if (estado.id !== null && estado.version !== null && estado.numero !== null && !cambios) {
      return { id: estado.id, version: estado.version, numero: estado.numero }
    }
    const enviado = estado
    const validacion = payloadGuardar(enviado)
    if (!validacion.ok) {
      mostrarErrores('Revisá los datos marcados', validacion.errores, enviado)
      return null
    }
    enCurso.current = true
    setAccion('guardar')
    try {
      const resultado = await guardarCotizacion(enviado)
      if (!resultado.ok) {
        // Otro guardó antes: no es un error de los datos, se ofrece "Recargar" (Task 12) sin tocar lo escrito.
        if (esConflicto(resultado.mensaje)) {
          setConflicto(true)
          return null
        }
        mostrarErrores(resultado.mensaje, resultado.errores ?? {}, enviado)
        return null
      }
      setConflicto(false)
      const { id, version, numero } = resultado.datos
      const guardadoAhora: AccionEditor = { tipo: 'guardado', id, version, numero }
      // Lo que se mandó pasa a ser lo guardado; lo tipeado mientras tanto sigue contando como cambio.
      setGuardado(reducirEditor(enviado, guardadoAhora))
      despachar(guardadoAhora)
      setErrores({})
      setErroresItems({})
      setAviso(null)
      if (avisar) toast.success(enviado.id === null ? `Cotización N° ${numero} creada` : 'Cotización guardada')
      // replace: "Atrás" no vuelve a una cotización nueva vacía (decisión 8).
      if (enviado.id === null && navegar) router.replace(`/cotizaciones/${id}`)
      return resultado.datos
    } catch (error) {
      unstable_rethrow(error)
      mostrarErrores('No se pudo guardar. Probá de nuevo en un momento.', {}, enviado)
      return null
    } finally {
      enCurso.current = false
      setAccion(null)
    }
  }

  /** Para el celular: guarda si hace falta y devuelve el id de lo guardado (null si no se pudo). */
  async function guardarParaVer(): Promise<string | null> {
    const guardada = await guardar()
    return guardada?.id ?? null
  }

  // Acciones de estado (Task 12): con una en curso se deshabilitan todos los botones, Guardar incluido.
  const acciones = useAccionesEstado({
    estado,
    contexto,
    pendientes,
    hayCambiosSinGuardar: cambios,
    guardar,
    accion,
    setAccion,
    conflicto,
    setConflicto,
    esperarServidor,
    accionInicial,
  })
  const ocupado = acciones.ocupado

  // Después de una transición (o de "Recargar") el servidor manda otra versión en `inicial`: el editor la toma. Se
  // ajusta durante el render (como recomienda React para un estado que depende de una prop), no en un efecto.
  // "Recargar" toma `inicial` cuando termina el refresco, sin comparar versiones: cualquier acción que revalida (el
  // alta rápida de un cliente, por ejemplo) vuelve a dibujar la página, así que `inicial` puede traer antes la versión
  // del otro usuario o una intermedia (si después volvió a guardar); tomarla en cuanto difiere de la local ignoraría
  // la del refresco, que es la actual.
  const llegoLaVersion =
    espera?.modo === 'descartar'
      ? !acciones.recargando
      : espera !== null && inicial.version !== null && !espera.ignorar.includes(inicial.version)
  if (espera && llegoLaVersion) {
    // Recargar descarta lo local. Después de una transición, lo que se haya tipeado mientras corría queda encima del
    // estado y la versión nuevos.
    const tomado =
      espera.modo === 'descartar' || !cambios ? inicial : { ...estado, estado: inicial.estado, version: inicial.version }
    setEspera(null)
    setGuardado(inicial)
    despachar({ tipo: 'reemplazar', estado: tomado })
    // Los contactos son los del cliente de `inicial` (la página los vuelve a leer en cada render), salvo que lo
    // tipeado durante la transición haya cambiado de cliente: ahí siguen los de ese.
    if (tomado.cliente?.id === inicial.cliente?.id) setContactos(contactosIniciales)
    if (espera.modo === 'descartar') {
      setErrores({})
      setErroresItems({})
      setAviso(null)
    }
  }

  // Con errores, el foco va al primer campo marcado (como FormularioAccion).
  useEffect(() => {
    if (Object.keys(errores).length === 0) return
    raiz.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errores])

  // Ctrl/⌘+S guarda (y nunca abre el "Guardar como…" del navegador). Con una acción en curso (guardar, una de estado
  // o la recarga) no hace nada, igual que el botón deshabilitado (decisión 12): guardar cambiaría la versión que esa
  // acción ya mandó.
  const alTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if (esAtajoGuardar(evento)) {
      evento.preventDefault()
      if (!ocupado) void guardar()
    }
  })
  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => alTeclear(evento)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación al navegador.
  useEffect(() => {
    if (!sinGuardar) return
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sinGuardar])

  return (
    <div ref={raiz}>
      <Contenido className="pb-28 min-[72rem]:pb-8">
        <EncabezadoEditor
          estado={estado}
          hoy={hoy}
          editable={editable}
          cambios={sinGuardar}
          guardando={accion === 'guardar'}
          ocupado={ocupado}
          alGuardar={() => void guardar()}
          acciones={<AccionesEncabezado estado={estado} contexto={contexto} pendientes={pendientes} acciones={acciones} />}
        />
        <FranjasEditor
          estado={estado}
          contexto={contexto}
          pendientes={pendientes}
          acciones={acciones}
          hayCambiosSinGuardar={cambios}
          hoy={hoy}
        />
        {aviso ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{aviso}</p>
              {sueltos.length ? (
                <ul className="list-disc pl-5">
                  {sueltos.map((mensaje) => (
                    <li key={mensaje}>{mensaje}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid items-start gap-5 min-[72rem]:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          {/* Aprobada o rechazada: todo de solo lectura, pero legible (sin la opacidad de :disabled). */}
          <fieldset
            disabled={!editable}
            className="min-w-0 space-y-4 [&_:disabled]:opacity-100! [&_[data-slot=native-select-wrapper]]:opacity-100!"
          >
            <legend className="sr-only">Contenido de la cotización</legend>
            <TarjetaCliente
              estado={estado}
              contactos={contactos}
              errores={errores}
              despachar={despachar}
              alCambiarContactos={setContactos}
            />
            <TarjetaDatos
              estado={estado}
              catalogos={catalogos}
              pendientes={pendientes}
              errores={errores}
              despachar={despachar}
            />
            <TarjetaAsunto estado={estado} errores={errores} despachar={despachar} />
            <TarjetaItems
              items={estado.items}
              formato={estado.formato}
              mostrarTotal={estado.mostrarTotal}
              errores={erroresItems}
              despachar={despachar}
              alCambiarBorradorSeccion={alCambiarBorradorSeccion}
            />
            <TarjetaTextos
              bloques={estado.bloques}
              plantilla={catalogos.plantillas.find((plantilla) => plantilla.id === estado.plantillaId) ?? null}
              errores={errores}
              despachar={despachar}
            />
          </fieldset>
          <ColumnaVistaPrevia vista={vista} linea={lineaVista} />
        </div>
      </Contenido>
      <BarraInferior
        editable={editable}
        esNueva={estado.id === null}
        cambios={sinGuardar}
        guardando={accion === 'guardar'}
        ocupado={ocupado}
        alGuardar={() => void guardar()}
        vistaPrevia={
          <>
            <VistaPreviaLateral vista={vista} linea={lineaVista} />
            <BotonVistaPreviaCelular modo={vista.modo} ocupado={ocupado} guardarParaVer={guardarParaVer} />
          </>
        }
      />
    </div>
  )
}
