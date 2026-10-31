'use client'

import type { StatusEditor } from '@/lib/quotes/editor/types'
import {
  messageErrorViewPreview,
  modeViewPreview,
  viewDesactualizada,
  type ModeViewPreview,
} from '@/lib/quotes/preview'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { PREVIEW_DESKTOP_QUERY, isPreviewDesktop } from './preview-media'

class ErrorResponse extends Error {
  status: number
  constructor(status: number) {
    super(`La vista previa respondió ${status}`)
    this.status = status
  }
}

export type ViewPreview = {
  modo: ModeViewPreview
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
export function useQuotePreview(estado: StatusEditor): ViewPreview {
  const modo = modeViewPreview(estado)
  const [generada, setGenerada] = useState<{ url: string; con: StatusEditor } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pedido = useRef<AbortController | null>(null)
  const urlViva = useRef<string | null>(null)
  const intentada = useRef(false)

  const actualizar = useCallback(() => {
    pedido.current?.abort()
    const controlador = new AbortController()
    pedido.current = controlador
    const sent = estado
    setCargando(true)
    setError(null)
    void (async () => {
      try {
        const response = await fetch('/cotizaciones/vista-previa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: sent }),
          signal: controlador.signal,
          // Sin sesión, el proxy no deja llegar el pedido a la ruta y redirige al login. Seguir ese redirect daría
          // un 200 con el HTML del login, que se dibujaría en la hoja: se corta acá y se toma como sesión vencida.
          redirect: 'manual',
        })
        if (response.type === 'opaqueredirect') throw new ErrorResponse(401)
        if (!response.ok) throw new ErrorResponse(response.status)
        // Solo un PDF va al visor (y al "Abrir el PDF en otra pestaña"): cualquier otra respuesta es un error.
        if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
          throw new ErrorResponse(response.status)
        }
        const pdf = await response.blob()
        if (controlador.signal.aborted) return
        // El blob anterior se libera recién cuando hay uno nuevo: el <iframe> lo sigue mostrando hasta entonces.
        const url = URL.createObjectURL(pdf)
        if (urlViva.current) URL.revokeObjectURL(urlViva.current)
        urlViva.current = url
        setGenerada({ url, con: sent })
      } catch (e) {
        if (controlador.signal.aborted) return
        if (!(e instanceof ErrorResponse)) console.error(e)
        setError(messageErrorViewPreview(e instanceof ErrorResponse ? e.status : null))
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
    if (intentada.current || modo.tipo !== 'generada' || !isPreviewDesktop()) return
    intentada.current = true
    actualizar()
  })

  // Si la ventana pasa al ancho de escritorio (se agranda o se gira la tableta), la columna aparece: con la hoja vacía
  // se genera como al entrar. Sin esto esperaría al próximo render del editor.
  const onPasarAEscritorio = useEffectEvent(() => {
    if (modo.tipo !== 'generada' || generada || cargando || error) return
    intentada.current = true
    actualizar()
  })
  useEffect(() => {
    const consulta = window.matchMedia(PREVIEW_DESKTOP_QUERY)
    const escuchar = (evento: MediaQueryListEvent) => {
      if (evento.matches) onPasarAEscritorio()
    }
    consulta.addEventListener('change', escuchar)
    return () => consulta.removeEventListener('change', escuchar)
  }, [])

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

  const desactualizada = useMemo(() => viewDesactualizada(generada?.con ?? null, estado), [generada, estado])
  const url = modo.tipo === 'generada' ? (generada?.url ?? null) : modo.tipo === 'guardada' ? modo.url : null
  return { modo, url, cargando, error, desactualizada, actualizar }
}
