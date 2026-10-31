'use client'
// src/components/cotizaciones/editor/barra-inferior.tsx

import { Button } from '@/components/ui/button'

/**
 * Barra fija abajo cuando no hay columna de vista previa (< 90rem): Guardar siempre a mano sin volver sticky el
 * encabezado. `vistaPrevia` (Task 11) es un hueco. Las transiciones no van acá: quedan en el encabezado (decisión 16).
 */
export function BarraInferior({
  editable,
  esNueva,
  cambios,
  guardando,
  ocupado,
  alGuardar,
  vistaPrevia,
}: {
  editable: boolean
  esNueva: boolean
  cambios: boolean
  guardando: boolean
  ocupado: boolean
  alGuardar: () => void
  vistaPrevia?: React.ReactNode
}) {
  if (!editable && !vistaPrevia) return null
  const estadoGuardado = esNueva ? 'Todavía no se guardó' : cambios ? 'Cambios sin guardar' : 'Todo guardado'

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-60 min-[90rem]:hidden">
      <p aria-live="polite" className="mr-auto min-w-0 truncate text-sm text-muted-foreground">
        {editable ? estadoGuardado : null}
      </p>
      {vistaPrevia}
      {editable ? (
        <Button
          type="button"
          size="lg"
          onClick={alGuardar}
          disabled={ocupado || (!esNueva && !cambios)}
          className="h-10 px-4 text-[15px] shadow-md shadow-primary/20"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      ) : null}
    </div>
  )
}
