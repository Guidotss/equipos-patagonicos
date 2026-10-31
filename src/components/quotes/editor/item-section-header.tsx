import { Input } from '@/components/ui/input'
import type { EditorDispatch } from '@/lib/quotes/editor-screen'
import { type RowSection } from '@/lib/quotes/grid'
import { cn } from '@/lib/utils'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ITEM_INPUT_CLASS, type OnChangeDraftSection } from './items-grid.constants'

/**
 * Encabezado editable de una sección. El nombre se aplica al salir del campo o con Enter, no en cada tecla:
 * renombrarSeccion junta el grupo con el vecino si quedan con el mismo nombre, y a mitad de escribir
 * ("Precios Jornada Adicional" → "Precios Jornada") el encabezado desaparecería con el foco adentro.
 * Mientras tanto el borrador cuenta como cambio sin guardar: se registra arriba con su `aplicar`, que habilita Guardar
 * y que guardar (el botón o Ctrl/⌘+S) llama antes de leer el estado. Así no depende de que el blur del clic llegue antes
 * que el click (no está verificado en Safari ni en iOS).
 */
export function HeaderSection({
  row,
  error,
  dispatch,
  onChangeDraft,
}: {
  row: RowSection
  error?: string
  dispatch: EditorDispatch
  onChangeDraft: OnChangeDraftSection
}) {
  const id = `seccion-${row.key}`
  const [draft, setDraft] = useState<string | null>(null)
  const pending = draft !== null && draft !== row.section

  function apply() {
    if (draft !== null && draft !== row.section) {
      dispatch({ tipo: 'renombrarSeccion', clave: row.key, seccion: draft })
    }
    setDraft(null)
  }

  // El registro del editor llama al aplicar del último render: el que tiene el borrador que se ve.
  const applyCurrent = useRef(apply)
  useLayoutEffect(() => {
    applyCurrent.current = apply
  })

  // También al desmontarse con el borrador a medio escribir (la limpieza lo retira).
  useEffect(() => {
    if (!pending) return
    onChangeDraft(row.key, () => applyCurrent.current())
    return () => onChangeDraft(row.key, null)
  }, [pending, row.key, onChangeDraft])

  return (
    <div className="border-b bg-muted/60 p-3 @min-[44rem]:pl-12">
      <Input
        id={id}
        aria-label={`Nombre de la sección ${row.number}`}
        value={draft ?? row.section}
        maxLength={100}
        // Una sección sin nombre sale como "Precios:" en el PDF por jornada.
        placeholder="Precios"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          // Ctrl/⌘+S lo maneja el editor: guardar aplica antes los borradores registrados.
          if (event.nativeEvent.isComposing || event.key !== 'Enter') return
          event.preventDefault()
          apply()
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(ITEM_INPUT_CLASS, 'max-w-md px-2.5 font-semibold')}
      />
      {error ? (
        <p id={`${id}-error`} className="px-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
