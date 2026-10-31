'use client'
// src/components/cotizaciones/editor/encabezado-editor.tsx

import { HeaderPage } from '@/components/app-shell/header'
import { StatusQuote } from '@/components/quotes/status-quote'
import { Button } from '@/components/ui/button'
import type { StatusEditor } from '@/lib/quotes/editor'
import { resumenHeader } from '@/lib/quotes/editor-screen'
import { cn } from '@/lib/utils'

export function HeaderEditor({
  estado,
  today,
  editable,
  changes,
  guardando,
  busy,
  onSave,
  actions,
}: {
  estado: StatusEditor
  today: string
  editable: boolean
  changes: boolean
  guardando: boolean
  /** Alguna acción corre: todos los botones de acción quedan deshabilitados (decisión 12). */
  busy: boolean
  onSave: () => void
  /** Botones de transición y menú ⋯ (Task 12), a la derecha de Guardar. Botones size="lg" (h-9). */
  actions?: React.ReactNode
}) {
  const resumen = resumenHeader(estado, today)

  return (
    <HeaderPage
      compact
      titulo={resumen.titulo}
      extra={<StatusQuote estado={estado.estado} vencida={resumen.vence?.vencida ?? false} />}
      descripcion={
        <>
          {resumen.detail}
          {resumen.vence ? (
            <>
              {' · '}
              <span className={cn(resumen.vence.vencida && 'text-amber-700')}>{resumen.vence.texto}</span>
            </>
          ) : null}
        </>
      }
      actions={
        <>
          {editable ? (
            // Debajo de 90rem Guardar está en la barra fija de abajo (BarraInferior).
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onSave}
              disabled={busy || (estado.id !== null && !changes)}
              className="hidden min-[90rem]:inline-flex"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          ) : null}
          {actions}
        </>
      }
    />
  )
}
