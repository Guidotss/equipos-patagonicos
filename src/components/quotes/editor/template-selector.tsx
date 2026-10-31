import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ID_FIELD, changesOfContent, templatesOfFormat, type EditorDispatch } from '@/lib/quotes/editor-screen'
import type { StatusEditor, TemplateEditor } from '@/lib/quotes/editor/types'
import { FORMATS, type Format } from '@/lib/templates/content'
import Link from 'next/link'
import { useRef, useState } from 'react'

export function SelectorTemplate({
  state,
  templates,
  error,
  dispatch,
}: {
  state: StatusEditor
  templates: TemplateEditor[]
  error?: string
  dispatch: EditorDispatch
}) {
  const [pending, setPending] = useState<TemplateEditor | null>(null)
  const group = useRef<HTMLDivElement>(null)
  const current = templates.find((template) => template.id === state.templateId) ?? null
  const ofFormat = templatesOfFormat(templates, state.formato)

  function choose(template: TemplateEditor | undefined) {
    if (!template || template.id === state.templateId) return
    if (changesOfContent(state, current)) setPending(template)
    else dispatch({ tipo: 'plantilla', plantilla: template })
  }

  // Al cerrar la confirmación el foco vuelve a la opción elegida (después del render).
  function close() {
    setPending(null)
    requestAnimationFrame(() => group.current?.querySelector<HTMLElement>('[data-state="on"]')?.focus())
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay plantillas activas.{' '}
        <Link href="/configuracion/plantillas" className="text-primary underline-offset-4 hover:underline">
          Revisalas en Configuración
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Un valor vacío es "deseleccionar" (Radix): el formato siempre queda elegido. */}
        <ToggleGroup
          ref={group}
          type="single"
          aria-label="Formato"
          value={state.formato}
          onValueChange={(value) => {
            if (value) choose(templatesOfFormat(templates, value as Format)[0])
          }}
          className="h-8 gap-0 rounded-lg bg-muted p-0.5"
        >
          {(Object.keys(FORMATS) as Format[]).map((format) => (
            <ToggleGroupItem
              key={format}
              value={format}
              disabled={templatesOfFormat(templates, format).length === 0}
              className="h-7 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {FORMATS[format]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {ofFormat.length > 1 ? (
          <NativeSelect
            id={ID_FIELD.plantilla}
            aria-label="Plantilla"
            value={state.templateId}
            onChange={(event) => choose(templates.find((template) => template.id === event.target.value))}
            className="min-w-0 flex-1"
          >
            {ofFormat.map((template) => (
              <NativeSelectOption key={template.id} value={template.id}>
                {template.nombre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pending ? (
        <InlineConfirmation
          tone="aviso"
          pregunta={`¿Cambiar a la plantilla «${pending.nombre}»?`}
          detail="Se reemplazan el asunto, la introducción, los textos y los ítems."
          textConfirm="Cambiar plantilla"
          onConfirm={() => {
            dispatch({ tipo: 'plantilla', plantilla: pending })
            close()
          }}
          onCancelar={close}
        />
      ) : null}
    </div>
  )
}
