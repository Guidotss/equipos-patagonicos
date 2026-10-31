'use client'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { urlPdfCurrent, urlVisor, type ModeViewPreview } from '@/lib/quotes/preview'
import { cn } from '@/lib/utils'
import { CircleAlert, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { useId, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { isPreviewDesktop, subscribePreviewDesktop } from './preview-media'
import type { ViewPreview } from './use-quote-preview'
export { useQuotePreview as useViewPreview } from './use-quote-preview'
export type { ViewPreview } from './use-quote-preview'

/** Hoja vacía con líneas tenues: mientras se genera la primera vista previa o antes de pedirla. */
function SheetEmpty({ cargando }: { cargando: boolean }) {
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
export function PanelViewPreview({
  view,
  line,
  showVisor = true,
  className,
}: {
  view: ViewPreview
  /** lineaVistaPrevia(…): qué se está viendo. */
  line: string
  /** false: la hoja queda sin el <iframe> del PDF (el panel no está a la vista; ver ColumnaVistaPrevia). */
  showVisor?: boolean
  className?: string
}) {
  const idTitle = useId()
  const { modo } = view

  return (
    <section aria-labelledby={idTitle} className={cn('space-y-3', className)}>
      {/* La línea va debajo de la fila del título y los botones, a todo el ancho: al lado de "Actualizar vista
          previa", en los 20rem de la columna, quedaría partida en cuatro renglones. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id={idTitle} className="min-w-0 text-lg leading-tight font-semibold tracking-tight">
            Vista previa
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {modo.tipo === 'generada' ? (
              <Button type="button" variant="outline" size="sm" onClick={view.actualizar} disabled={view.cargando}>
                <RefreshCw className={cn(view.cargando && 'animate-spin')} aria-hidden />
                Actualizar vista previa
              </Button>
            ) : null}
            {view.url ? (
              <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
                <a
                  href={view.url}
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
        {line ? (
          <p className={cn('text-[13px] text-muted-foreground', view.desactualizada && 'text-amber-700')}>{line}</p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {view.cargando ? 'Generando la vista previa…' : ''}
      </p>

      {modo.tipo === 'sin-pdf' ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          Un presupuesto directo no tiene PDF.
        </div>
      ) : (
        <div className="max-h-[calc(100svh-11rem)] overflow-y-auto overscroll-contain rounded-xl bg-muted p-3">
          {view.error ? (
            <div
              role="alert"
              className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-3 rounded-[2px] bg-background px-6 text-center text-sm"
            >
              <CircleAlert className="size-6 text-destructive" aria-hidden />
              <p>{view.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={view.actualizar} disabled={view.cargando}>
                Reintentar
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                'relative aspect-[210/297] w-full overflow-hidden rounded-[2px] bg-white shadow-md ring-1 ring-black/5 transition-opacity',
                (view.desactualizada || (view.cargando && view.url)) && 'opacity-60',
              )}
            >
              {view.url ? (
                // Un <iframe> nuevo por PDF (key): cambiarle el src agregaría entradas al historial y "Atrás"
                // navegaría dentro del panel en vez de salir del editor.
                showVisor ? (
                  <iframe
                    key={view.url}
                    src={urlVisor(view.url)}
                    title="Vista previa del PDF"
                    className="absolute inset-0 size-full border-0"
                  />
                ) : null
              ) : modo.tipo === 'sin-cliente' ? (
                <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                  Elegí el cliente para ver cómo sale el PDF.
                </p>
              ) : (
                <SheetEmpty cargando={view.cargando} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * La columna fija del editor (≥ 90rem). Más angosta queda oculta (display: none), pero un <iframe> oculto igual se
 * carga: bajaría el PDF para nada (y, en un navegador sin visor embebido, como el de algunos celulares, lo
 * descargaría sin que nadie lo pida). Por eso el visor se dibuja recién cuando la columna se ve. El ancho se mira
 * acá y no en EditorCotizacion: el render extra al hidratar (en el servidor no se conoce) queda en esta columna.
 */
export function ColumnViewPreview({ view, line }: { view: ViewPreview; line: string }) {
  const seVe = useSyncExternalStore(subscribePreviewDesktop, isPreviewDesktop, () => false)
  return (
    // 56 px de migas + 16: la columna acompaña el scroll debajo de la barra (relev-visual §3.8).
    // pt-5.5: el título "Vista previa" queda a la altura del de la tarjeta Cliente (borde + p-6).
    <aside className="sticky top-18 hidden self-start min-[90rem]:block">
      <PanelViewPreview view={view} line={line} showVisor={seVe} className="pt-5.5" />
    </aside>
  )
}

/**
 * Entre md y 90rem no hay columna: la barra inferior abre el mismo panel en un Sheet lateral.
 * Si todavía no se generó ninguna, se genera al abrirlo.
 */
export function ViewPreviewLateral({ view, line }: { view: ViewPreview; line: string }) {
  if (view.modo.tipo === 'sin-pdf') return null
  return (
    <Sheet
      onOpenChange={(abierta) => {
        if (abierta && view.modo.tipo === 'generada' && !view.url && !view.cargando) view.actualizar()
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
        <PanelViewPreview view={view} line={line} />
      </SheetContent>
    </Sheet>
  )
}

/**
 * En el celular la vista previa es el PDF en otra pestaña (diseño §6): se guarda y se abre la versión actual.
 * `guardarParaVer` devuelve el id de la cotización ya guardada, o null si no se pudo guardar.
 */
export function ButtonViewPreviewCelular({
  modo,
  busy,
  validate,
  saveForVer,
}: {
  modo: ModeViewPreview
  /** Hay una acción en curso. Este botón guarda, así que espera como los demás (decisión 12). */
  busy: boolean
  /** La validación local de lo que se guardaría: si no pasa, marca los campos, avisa y devuelve false. */
  validate: () => boolean
  saveForVer: () => Promise<string | null>
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
    // Lo que no se puede guardar (sin cliente, una validez fuera de rango…) no abre una pestaña en blanco que habría
    // que cerrar enseguida: se marcan los campos y se avisa.
    if (!validate()) return
    // La pestaña se abre en el clic: abierta después de guardar, el navegador la bloquearía por no venir del usuario.
    const pestana = window.open('', '_blank')
    setAbriendo(true)
    try {
      const id = await saveForVer()
      if (!id) {
        pestana?.close()
        return
      }
      if (pestana) {
        pestana.opener = null
        pestana.location.href = urlPdfCurrent(id)
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
    <Button type="button" variant="outline" size="lg" className={clases} onClick={abrir} disabled={abriendo || busy}>
      <FileText aria-hidden />
      {abriendo ? 'Guardando…' : 'Vista previa'}
    </Button>
  )
}
