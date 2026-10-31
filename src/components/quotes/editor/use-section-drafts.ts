'use client'

import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

export function useSectionDrafts() {
  /** Secciones de la grilla con el nombre escrito y todavía no aplicado (borrador local de CardItems). */
  const [sectionDrafts, setSectionDrafts] = useState<ReadonlySet<string>>(() => new Set())
  /** El `aplicar` de cada uno de esos borradores, por clave de sección: guardar los aplica antes de leer el estado. */
  const applyDraft = useRef(new Map<string, () => void>())
  const onChangeDraftSection = useCallback((key: string, apply: (() => void) | null) => {
    if (apply) applyDraft.current.set(key, apply)
    else applyDraft.current.delete(key)
    const has = apply !== null
    setSectionDrafts((current) => {
      if (current.has(key) === has) return current
      const next = new Set(current)
      if (has) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  /**
   * Aplica ya los nombres de sección a medio escribir (renderizados con flushSync), de forma explícita: no depende de
   * que el blur del campo llegue antes que el click de Guardar (no está verificado en Safari ni en iOS) ni del orden
   * de los keydown en Ctrl/⌘+S.
   */
  function applySectionDrafts() {
    const pendingDrafts = [...applyDraft.current.values()]
    if (pendingDrafts.length === 0) return
    flushSync(() => {
      for (const apply of pendingDrafts) apply()
    })
  }

  return { hasDraftSection: sectionDrafts.size > 0, onChangeDraftSection, applySectionDrafts }
}
