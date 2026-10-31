'use client'
// src/components/cotizaciones/editor/encabezado-editor.tsx

import { HeaderPage } from '@/components/app-shell/header'
import { StatusQuote } from '@/components/quotes/status-quote'
import { Button } from '@/components/ui/button'
import type { StatusEditor } from '@/lib/quotes/editor/types'
import { headerSummary } from '@/lib/quotes/editor-screen'
import { cn } from '@/lib/utils'

export function HeaderEditor({
  state,
  today,
  editable,
  changes,
  saving,
  busy,
  onSave,
  actions,
}: {
  state: StatusEditor
  today: string
  editable: boolean
  changes: boolean
  saving: boolean
  /** Alguna acción corre: todos los botones de acción quedan deshabilitados (decisión 12). */
  busy: boolean
  onSave: () => void
  /** Botones de transición y menú ⋯ (Task 12), a la derecha de Guardar. Botones size="lg" (h-9). */
  actions?: React.ReactNode
}) {
  const summary = headerSummary(state, today)

  return (
    <HeaderPage
      compact
      titulo={summary.title}
      extra={<StatusQuote estado={state.estado} vencida={summary.expiration?.expired ?? false} />}
      descripcion={
        <>
          {summary.detail}
          {summary.expiration ? (
            <>
              {' · '}
              <span className={cn(summary.expiration.expired && 'text-amber-700')}>{summary.expiration.text}</span>
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
              disabled={busy || (state.id !== null && !changes)}
              className="hidden min-[90rem]:inline-flex"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          ) : null}
          {actions}
        </>
      }
    />
  )
}
