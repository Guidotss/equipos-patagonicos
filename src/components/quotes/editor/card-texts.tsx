'use client'

import { Card } from '@/components/form/card'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import type { Despachar, ErrorsBlock } from '@/lib/quotes/editor-screen'
import type { BlockEditor, TemplateEditor } from '@/lib/quotes/editor/types'
import { blockOfTemplate, mismosBlocks } from '@/lib/templates/editing'
import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'

import { EditorBlock } from './editor-block'

const ICONO = 'text-muted-foreground'

const WITHOUT_ERRORS: ErrorsBlock = {}

export function CardTexts({
  bloques,
  plantilla: template,
  errors,
  despachar,
}: {
  bloques: BlockEditor[]
  /** La plantilla de la cotización (también si está inactiva); null si no tiene. */
  plantilla: TemplateEditor | null
  /** Los errores de guardado de los bloques, por clave de bloque (erroresDeBloques). */
  errors: Record<string, ErrorsBlock>
  despachar: Despachar
}) {
  const [confirmando, setConfirmando] = useState(false)
  const buttonRestore = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const hasQueRestore = template !== null && bloques.length > 0 && !mismosBlocks(bloques, template.bloques)

  /**
   * Restaurados, los bloques son otros (claves nuevas) y el botón que se tocó ya no está: el foco va al primero, a su
   * título (o a su "Mostrar", si viene oculto), en vez de quedar en el body.
   */
  function restoreTodos() {
    if (!template) return
    despachar({ tipo: 'restaurarBloques', bloques: template.bloques })
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('input, button')?.focus())
  }

  function cerrar() {
    setConfirmando(false)
    requestAnimationFrame(() => buttonRestore.current?.focus())
  }

  return (
    <Card
      compacta
      titulo="Textos"
      actions={
        hasQueRestore ? (
          <Button
            ref={buttonRestore}
            type="button"
            variant="ghost"
            size="sm"
            className={ICONO}
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
            Restaurar desde la plantilla
          </Button>
        ) : null
      }
    >
      {confirmando && template ? (
        <ConfirmationInLugar
          tone="aviso"
          pregunta={`¿Restaurar todos los textos desde «${template.nombre}»?`}
          detail="Se pierden los cambios hechos en los textos de esta cotización, también los bloques ocultos."
          textConfirm="Restaurar"
          onConfirm={() => {
            setConfirmando(false)
            restoreTodos()
          }}
          onCancelar={cerrar}
        />
      ) : null}
      {bloques.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-6">
          <p className="flex-1 text-[15px] text-muted-foreground">Esta cotización no tiene textos.</p>
          {template && template.bloques.length > 0 ? (
            // Sin textos no hay nada que perder: restaura sin confirmar.
            <Button type="button" variant="outline" size="sm" onClick={restoreTodos}>
              <RotateCcw aria-hidden />
              Restaurar desde la plantilla
            </Button>
          ) : null}
        </div>
      ) : (
        <div ref={list} className="space-y-3">
          {bloques.map((block, index) => (
            <EditorBlock
              key={block.clave}
              bloque={block}
              index={index}
              total={bloques.length}
              original={template ? blockOfTemplate(template.bloques, bloques, index) : null}
              errors={errors[block.clave] ?? WITHOUT_ERRORS}
              despachar={despachar}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
