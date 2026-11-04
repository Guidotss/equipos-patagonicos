import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  onRemove,
}: {
  row: RowSection
  error?: string
  dispatch: EditorDispatch
  onChangeDraft: OnChangeDraftSection
  onRemove: (section: string) => void
}) {
  const removeButton = useRef<HTMLButtonElement>(null)
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
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b bg-muted/60 p-3 @min-[44rem]:pl-12">
      <Input
        id={id}
        aria-label={`Nombre de la sección ${row.number}`}
        value={draft ?? row.section}
        maxLength={100}
        // Una sección sin nombre sale como "Precios:" en el PDF por jornada.
        placeholder="Precios"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          // Tab permite activar Eliminar antes de que el nombre una esta sección con la vecina.
          if (event.relatedTarget !== removeButton.current) apply()
        }}
        onKeyDown={(event) => {
          // Ctrl/⌘+S lo maneja el editor: guardar aplica antes los borradores registrados.
          if (event.nativeEvent.isComposing || event.key !== 'Enter') return
          event.preventDefault()
          apply()
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(ITEM_INPUT_CLASS, 'min-w-0 flex-1 basis-32 @min-[44rem]:max-w-md px-2.5 font-semibold')}
      />
      <Button
        ref={removeButton}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Eliminar sección ${row.number}`}
        className="h-11 @min-[44rem]:h-10"
        onPointerDown={(event) => {
          // El clic congela las claves antes del blur, que podría unir grupos y desmontar este encabezado.
          if (event.button === 0) event.preventDefault()
        }}
        onClick={() => {
          onRemove(draft ?? row.section)
          apply()
        }}
        onBlur={apply}
      >
        <Trash2 aria-hidden data-icon="inline-start" />
        Eliminar sección
      </Button>
      {error ? (
        <p id={`${id}-error`} className="basis-full px-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
