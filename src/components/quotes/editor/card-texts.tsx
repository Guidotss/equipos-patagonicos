'use client'

import { Card } from '@/components/form/card'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import type { EditorDispatch, ErrorsBlock } from '@/lib/quotes/editor-screen'
import type { BlockEditor, TemplateEditor } from '@/lib/quotes/editor/types'
import { blockOfTemplate, sameBlocks } from '@/lib/templates/editing'
import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'

import { EditorBlock } from './editor-block'

const ICON_CLASS = 'text-muted-foreground'

const WITHOUT_ERRORS: ErrorsBlock = {}

export function CardTexts({
  blocks,
  template,
  errors,
  dispatch,
}: {
  blocks: BlockEditor[]
  /** La plantilla de la cotización (también si está inactiva); null si no tiene. */
  template: TemplateEditor | null
  /** Los errores de guardado de los bloques, por clave de bloque (erroresDeBloques). */
  errors: Record<string, ErrorsBlock>
  dispatch: EditorDispatch
}) {
  const [confirming, setConfirming] = useState(false)
  const buttonRestore = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const canRestoreAll = template !== null && blocks.length > 0 && !sameBlocks(blocks, template.bloques)

  /**
   * Restaurados, los bloques son otros (claves nuevas) y el botón que se tocó ya no está: el foco va al primero, a su
   * título (o a su "Mostrar", si viene oculto), en vez de quedar en el body.
   */
  function restoreAll() {
    if (!template) return
    dispatch({ tipo: 'restaurarBloques', bloques: template.bloques })
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('input, button')?.focus())
  }

  function close() {
    setConfirming(false)
    requestAnimationFrame(() => buttonRestore.current?.focus())
  }

  return (
    <Card
      compacta
      titulo="Textos"
      actions={
        canRestoreAll ? (
          <Button
            ref={buttonRestore}
            type="button"
            variant="ghost"
            size="sm"
            className={ICON_CLASS}
            disabled={confirming}
            onClick={() => setConfirming(true)}
          >
            <RotateCcw aria-hidden />
            Restaurar desde la plantilla
          </Button>
        ) : null
      }
    >
      {confirming && template ? (
        <InlineConfirmation
          tone="aviso"
          pregunta={`¿Restaurar todos los textos desde «${template.nombre}»?`}
          detail="Se pierden los cambios hechos en los textos de esta cotización, también los bloques ocultos."
          textConfirm="Restaurar"
          onConfirm={() => {
            setConfirming(false)
            restoreAll()
          }}
          onCancelar={close}
        />
      ) : null}
      {blocks.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-6">
          <p className="flex-1 text-[15px] text-muted-foreground">Esta cotización no tiene textos.</p>
          {template && template.bloques.length > 0 ? (
            // Sin textos no hay nada que perder: restaura sin confirmar.
            <Button type="button" variant="outline" size="sm" onClick={restoreAll}>
              <RotateCcw aria-hidden />
              Restaurar desde la plantilla
            </Button>
          ) : null}
        </div>
      ) : (
        <div ref={list} className="space-y-3">
          {blocks.map((block, index) => (
            <EditorBlock
              key={block.clave}
              block={block}
              index={index}
              total={blocks.length}
              original={template ? blockOfTemplate(template.bloques, blocks, index) : null}
              errors={errors[block.clave] ?? WITHOUT_ERRORS}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
