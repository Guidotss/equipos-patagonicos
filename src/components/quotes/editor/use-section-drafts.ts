'use client'

import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

export function useSectionDrafts() {
  /** Secciones de la grilla con el nombre escrito y todavía no aplicado (borrador local de TarjetaItems). */
  const [borradoresSection, setBorradoresSection] = useState<ReadonlySet<string>>(() => new Set())
  /** El `aplicar` de cada uno de esos borradores, por clave de sección: guardar los aplica antes de leer el estado. */
  const applyDraft = useRef(new Map<string, () => void>())
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

  return { hasDraftSection: borradoresSection.size > 0, onChangeDraftSection, applyBorradoresSection }
}
