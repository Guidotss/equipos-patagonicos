'use client'

import type { StatusEditor } from '@/lib/quotes/editor/types'
import {
  messageErrorViewPreview,
  modeViewPreview,
  isPreviewOutdated,
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
  mode: ModeViewPreview
  /** blob: de la última vista previa generada, o la ruta del PDF guardado. */
  url: string | null
  loading: boolean
  error: string | null
  /** Lo que hay en pantalla cambió después de generarla. */
  outdated: boolean
  refresh: () => void
}

/**
 * Estado de la vista previa. Vive en EditorQuote y lo comparten la columna fija y el panel lateral, así hay un
 * solo PDF generado y un solo blob que liberar. Se genera con el botón, no en cada tecla (decisión 16); en
 * escritorio, donde la columna está a la vista, la primera vez que se puede se genera sola.
 */
export function useQuotePreview(state: StatusEditor): ViewPreview {
  const mode = modeViewPreview(state)
  const [generated, setGenerated] = useState<{ url: string; state: StatusEditor } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const activeUrl = useRef<string | null>(null)
  const attempted = useRef(false)

  const refresh = useCallback(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const sent = state
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const response = await fetch('/cotizaciones/vista-previa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: sent }),
          signal: controller.signal,
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
        if (controller.signal.aborted) return
        // El blob anterior se libera recién cuando hay uno nuevo: el <iframe> lo sigue mostrando hasta entonces.
        const url = URL.createObjectURL(pdf)
        if (activeUrl.current) URL.revokeObjectURL(activeUrl.current)
        activeUrl.current = url
        setGenerated({ url, state: sent })
      } catch (e) {
        if (controller.signal.aborted) return
        if (!(e instanceof ErrorResponse)) console.error(e)
        setError(messageErrorViewPreview(e instanceof ErrorResponse ? e.status : null))
      } finally {
        if (request.current === controller) {
          request.current = null
          setLoading(false)
        }
      }
    })()
  }, [state])

  // El ancho se mira acá y no con un estado (useSyncExternalStore): en el servidor no se conoce, y el render extra
  // al hidratar volvería a dibujar todo el editor y los inputs controlados pisarían lo tipeado antes de hidratar.
  useEffect(() => {
    if (attempted.current || mode.type !== 'generada' || !isPreviewDesktop()) return
    attempted.current = true
    refresh()
  })

  // Si la ventana pasa al ancho de escritorio (se agranda o se gira la tableta), la columna aparece: con la hoja vacía
  // se genera como al entrar. Sin esto esperaría al próximo render del editor.
  const onDesktopEnter = useEffectEvent(() => {
    if (mode.type !== 'generada' || generated || loading || error) return
    attempted.current = true
    refresh()
  })
  useEffect(() => {
    const query = window.matchMedia(PREVIEW_DESKTOP_QUERY)
    const listen = (event: MediaQueryListEvent) => {
      if (event.matches) onDesktopEnter()
    }
    query.addEventListener('change', listen)
    return () => query.removeEventListener('change', listen)
  }, [])

  useEffect(
    () => () => {
      request.current?.abort()
      // En desarrollo, StrictMode desmonta y vuelve a montar: el pedido automático abortado se tiene que repetir.
      attempted.current = false
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current)
      activeUrl.current = null
    },
    [],
  )

  const outdated = useMemo(() => isPreviewOutdated(generated?.state ?? null, state), [generated, state])
  const url = mode.type === 'generada' ? (generated?.url ?? null) : mode.type === 'guardada' ? mode.url : null
  return { mode, url, loading, error, outdated, refresh }
}
