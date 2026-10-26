'use client'
// src/components/cotizaciones/editor/panel-vista-previa.tsx

import { CircleAlert, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import {
  mensajeErrorVistaPrevia,
  modoVistaPrevia,
  urlPdfActual,
  urlVisor,
  vistaDesactualizada,
  type ModoVistaPrevia,
} from '@/lib/cotizaciones/vista-previa'
import { cn } from '@/lib/utils'

/** Desde este ancho la vista previa es una columna fija (docs/diseno/referencias/03-editor-cotizacion.png). */
const ESCRITORIO = '(min-width: 72rem)'

function esEscritorio(): boolean {
  return window.matchMedia(ESCRITORIO).matches
}

function suscribirEscritorio(avisar: () => void) {
  const consulta = window.matchMedia(ESCRITORIO)
  consulta.addEventListener('change', avisar)
  return () => consulta.removeEventListener('change', avisar)
}

class ErrorRespuesta extends Error {
  status: number
  constructor(status: number) {
    super(`La vista previa respondió ${status}`)
    this.status = status
  }
}

export type VistaPrevia = {
  modo: ModoVistaPrevia
  /** blob: de la última vista previa generada, o la ruta del PDF guardado. */
  url: string | null
  cargando: boolean
  error: string | null
  /** Lo que hay en pantalla cambió después de generarla. */
  desactualizada: boolean
  actualizar: () => void
}

/**
 * Estado de la vista previa. Vive en EditorCotizacion y lo comparten la columna fija y el panel lateral, así hay un
 * solo PDF generado y un solo blob que liberar. Se genera con el botón, no en cada tecla (decisión 16); en
 * escritorio, donde la columna está a la vista, la primera vez que se puede se genera sola.
 */
export function useVistaPrevia(estado: EstadoEditor): VistaPrevia {
  const modo = modoVistaPrevia(estado)
  const [generada, setGenerada] = useState<{ url: string; con: EstadoEditor } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pedido = useRef<AbortController | null>(null)
  const urlViva = useRef<string | null>(null)
  const intentada = useRef(false)

  const actualizar = useCallback(() => {
    pedido.current?.abort()
    const controlador = new AbortController()
    pedido.current = controlador
    const enviado = estado
    setCargando(true)
    setError(null)
    void (async () => {
      try {
        const respuesta = await fetch('/cotizaciones/vista-previa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: enviado }),
          signal: controlador.signal,
          // Sin sesión, el proxy no deja llegar el pedido a la ruta y redirige al login. Seguir ese redirect daría
          // un 200 con el HTML del login, que se dibujaría en la hoja: se corta acá y se toma como sesión vencida.
          redirect: 'manual',
        })
        if (respuesta.type === 'opaqueredirect') throw new ErrorRespuesta(401)
        if (!respuesta.ok) throw new ErrorRespuesta(respuesta.status)
        // Solo un PDF va al visor (y al "Abrir el PDF en otra pestaña"): cualquier otra respuesta es un error.
        if (!respuesta.headers.get('content-type')?.startsWith('application/pdf')) {
          throw new ErrorRespuesta(respuesta.status)
        }
        const pdf = await respuesta.blob()
        if (controlador.signal.aborted) return
        // El blob anterior se libera recién cuando hay uno nuevo: el <iframe> lo sigue mostrando hasta entonces.
        const url = URL.createObjectURL(pdf)
        if (urlViva.current) URL.revokeObjectURL(urlViva.current)
        urlViva.current = url
        setGenerada({ url, con: enviado })
      } catch (e) {
        if (controlador.signal.aborted) return
        if (!(e instanceof ErrorRespuesta)) console.error(e)
        setError(mensajeErrorVistaPrevia(e instanceof ErrorRespuesta ? e.status : null))
      } finally {
        if (pedido.current === controlador) {
          pedido.current = null
          setCargando(false)
        }
      }
    })()
  }, [estado])

  // El ancho se mira acá y no con un estado (useSyncExternalStore): en el servidor no se conoce, y el render extra
  // al hidratar volvería a dibujar todo el editor y los inputs controlados pisarían lo tipeado antes de hidratar.
  useEffect(() => {
    if (intentada.current || modo.tipo !== 'generada' || !esEscritorio()) return
    intentada.current = true
    actualizar()
  })

  useEffect(
    () => () => {
      pedido.current?.abort()
      // En desarrollo, StrictMode desmonta y vuelve a montar: el pedido automático abortado se tiene que repetir.
      intentada.current = false
      if (urlViva.current) URL.revokeObjectURL(urlViva.current)
      urlViva.current = null
    },
    [],
  )

  const desactualizada = useMemo(() => vistaDesactualizada(generada?.con ?? null, estado), [generada, estado])
  const url = modo.tipo === 'generada' ? (generada?.url ?? null) : modo.tipo === 'guardada' ? modo.url : null
  return { modo, url, cargando, error, desactualizada, actualizar }
}

/** Hoja vacía con líneas tenues: mientras se genera la primera vista previa o antes de pedirla. */
function HojaVacia({ cargando }: { cargando: boolean }) {
  return (
    <div className="absolute inset-0 p-[9%]">
      <div aria-hidden className={cn('space-y-2.5', cargando && 'animate-pulse')}>
        <div className="ml-auto h-6 w-2/5 rounded-sm bg-slate-100" />
        <div className="h-2 w-1/2 rounded-sm bg-slate-100" />
        <div className="h-2 w-3/5 rounded-sm bg-slate-100" />
        <div className="h-2 w-2/5 rounded-sm bg-slate-100" />
        <div className="h-16 w-full rounded-sm bg-slate-100" />
        <div className="h-2 w-full rounded-sm bg-slate-100" />
        <div className="h-2 w-11/12 rounded-sm bg-slate-100" />
        <div className="h-2 w-4/5 rounded-sm bg-slate-100" />
      </div>
      {cargando ? null : (
        <p className="absolute inset-x-6 bottom-[30%] text-center text-[13px] text-muted-foreground">
          Tocá «Actualizar vista previa» para ver cómo sale el PDF.
        </p>
      )}
    </div>
  )
}

/**
 * Columna "Vista previa" del editor: la hoja en un pozo gris, con el PDF real en un <iframe> (decisión 16).
 * Presentacional: el estado lo maneja useVistaPrevia.
 */
export function PanelVistaPrevia({
  vista,
  linea,
  mostrarVisor = true,
  className,
}: {
  vista: VistaPrevia
  /** lineaVistaPrevia(…): qué se está viendo. */
  linea: string
  /** false: la hoja queda sin el <iframe> del PDF (el panel no está a la vista; ver ColumnaVistaPrevia). */
  mostrarVisor?: boolean
  className?: string
}) {
  const idTitulo = useId()
  const { modo } = vista

  return (
    <section aria-labelledby={idTitulo} className={cn('space-y-3', className)}>
      {/* La línea va debajo de la fila del título y los botones, a todo el ancho: al lado de "Actualizar vista
          previa", en los 20rem de la columna, quedaría partida en cuatro renglones. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id={idTitulo} className="min-w-0 text-lg leading-tight font-semibold tracking-tight">
            Vista previa
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {modo.tipo === 'generada' ? (
              <Button type="button" variant="outline" size="sm" onClick={vista.actualizar} disabled={vista.cargando}>
                <RefreshCw className={cn(vista.cargando && 'animate-spin')} aria-hidden />
                Actualizar vista previa
              </Button>
            ) : null}
            {vista.url ? (
              <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
                <a
                  href={vista.url}
                  target="_blank"
                  rel="noopener"
                  aria-label="Abrir el PDF en otra pestaña"
                  title="Abrir el PDF en otra pestaña"
                >
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        {linea ? (
          <p className={cn('text-[13px] text-muted-foreground', vista.desactualizada && 'text-amber-700')}>{linea}</p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {vista.cargando ? 'Generando la vista previa…' : ''}
      </p>

      {modo.tipo === 'sin-pdf' ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          Un presupuesto directo no tiene PDF.
        </div>
      ) : (
        <div className="max-h-[calc(100svh-11rem)] overflow-y-auto overscroll-contain rounded-xl bg-muted p-3">
          {vista.error ? (
            <div
              role="alert"
              className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-3 rounded-[2px] bg-background px-6 text-center text-sm"
            >
              <CircleAlert className="size-6 text-destructive" aria-hidden />
              <p>{vista.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={vista.actualizar} disabled={vista.cargando}>
                Reintentar
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                'relative aspect-[210/297] w-full overflow-hidden rounded-[2px] bg-white shadow-md ring-1 ring-black/5 transition-opacity',
                (vista.desactualizada || (vista.cargando && vista.url)) && 'opacity-60',
              )}
            >
              {vista.url ? (
                // Un <iframe> nuevo por PDF (key): cambiarle el src agregaría entradas al historial y "Atrás"
                // navegaría dentro del panel en vez de salir del editor.
                mostrarVisor ? (
                  <iframe
                    key={vista.url}
                    src={urlVisor(vista.url)}
                    title="Vista previa del PDF"
                    className="absolute inset-0 size-full border-0"
                  />
                ) : null
              ) : modo.tipo === 'sin-cliente' ? (
                <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                  Elegí el cliente para ver cómo sale el PDF.
                </p>
              ) : (
                <HojaVacia cargando={vista.cargando} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * La columna fija del editor (≥ 72rem). Más angosta queda oculta (display: none), pero un <iframe> oculto igual se
 * carga: bajaría el PDF para nada (y, en un navegador sin visor embebido, como el de algunos celulares, lo
 * descargaría sin que nadie lo pida). Por eso el visor se dibuja recién cuando la columna se ve. El ancho se mira
 * acá y no en EditorCotizacion: el render extra al hidratar (en el servidor no se conoce) queda en esta columna.
 */
export function ColumnaVistaPrevia({ vista, linea }: { vista: VistaPrevia; linea: string }) {
  const seVe = useSyncExternalStore(suscribirEscritorio, esEscritorio, () => false)
  return (
    // 56 px de migas + 16: la columna acompaña el scroll debajo de la barra (relev-visual §3.8).
    // pt-5.5: el título "Vista previa" queda a la altura del de la tarjeta Cliente (borde + p-6).
    <aside className="sticky top-18 hidden self-start min-[72rem]:block">
      <PanelVistaPrevia vista={vista} linea={linea} mostrarVisor={seVe} className="pt-5.5" />
    </aside>
  )
}

/**
 * Entre md y 72rem no hay columna: la barra inferior abre el mismo panel en un Sheet lateral.
 * Si todavía no se generó ninguna, se genera al abrirlo.
 */
export function VistaPreviaLateral({ vista, linea }: { vista: VistaPrevia; linea: string }) {
  if (vista.modo.tipo === 'sin-pdf') return null
  return (
    <Sheet
      onOpenChange={(abierta) => {
        if (abierta && vista.modo.tipo === 'generada' && !vista.url && !vista.cargando) vista.actualizar()
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="hidden h-10 px-3.5 text-[15px] md:inline-flex">
          <FileText aria-hidden />
          Vista previa
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto px-4 pt-12 pb-6 data-[side=right]:w-full data-[side=right]:sm:max-w-[28rem]"
      >
        <SheetTitle className="sr-only">Vista previa del PDF</SheetTitle>
        <SheetDescription className="sr-only">Cómo sale el PDF con lo que hay en pantalla.</SheetDescription>
        <PanelVistaPrevia vista={vista} linea={linea} />
      </SheetContent>
    </Sheet>
  )
}

/**
 * En el celular la vista previa es el PDF en otra pestaña (diseño §6): se guarda y se abre la versión actual.
 * `guardarParaVer` devuelve el id de la cotización ya guardada, o null si no se pudo guardar.
 */
export function BotonVistaPreviaCelular({
  modo,
  ocupado,
  guardarParaVer,
}: {
  modo: ModoVistaPrevia
  /** Hay una acción en curso. Este botón guarda, así que espera como los demás (decisión 12). */
  ocupado: boolean
  guardarParaVer: () => Promise<string | null>
}) {
  const [abriendo, setAbriendo] = useState(false)
  if (modo.tipo === 'sin-pdf') return null

  const clases = 'h-10 px-3.5 text-[15px] md:hidden'
  if (modo.tipo === 'guardada') {
    return (
      <Button asChild variant="outline" size="lg" className={clases}>
        <a href={modo.url} target="_blank" rel="noopener">
          <FileText aria-hidden />
          Vista previa
        </a>
      </Button>
    )
  }

  async function abrir() {
    // Sin cliente no se puede guardar: el intento marca el campo y explica por qué, sin abrir una pestaña en blanco.
    if (modo.tipo === 'sin-cliente') {
      await guardarParaVer()
      return
    }
    // La pestaña se abre en el clic: abierta después de guardar, el navegador la bloquearía por no venir del usuario.
    const pestana = window.open('', '_blank')
    setAbriendo(true)
    try {
      const id = await guardarParaVer()
      if (!id) {
        pestana?.close()
        return
      }
      if (pestana) {
        pestana.opener = null
        pestana.location.href = urlPdfActual(id)
      } else {
        toast.info('El navegador bloqueó la pestaña nueva: permitila para ver la vista previa.')
      }
    } catch (error) {
      // Un redirect que relanza guardar (la sesión venció) o algo inesperado: la pestaña en blanco no queda abierta.
      pestana?.close()
      throw error
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={clases}
      onClick={abrir}
      disabled={abriendo || ocupado}
    >
      <FileText aria-hidden />
      {abriendo ? 'Guardando…' : 'Vista previa'}
    </Button>
  )
}
