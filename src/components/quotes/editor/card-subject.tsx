'use client'
// src/components/cotizaciones/editor/tarjeta-asunto.tsx

import { Field } from '@/components/form/field'
import { Card } from '@/components/form/card'
import { WithVariables } from '@/components/templates/text-formatted'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { StatusEditor } from '@/lib/quotes/editor/types'
import { ID_FIELD, type EditorDispatch } from '@/lib/quotes/editor-screen'
import { usedVariables } from '@/lib/templates/variables'

/** Debajo del campo: el texto con sus variables marcadas, para ver qué se completa solo. */
function Variables({ text }: { text: string }) {
  if (usedVariables(text).length === 0) return null
  return (
    <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
      <WithVariables texto={text} />
    </p>
  )
}

export function CardSubject({
  state,
  errors,
  dispatch,
}: {
  state: StatusEditor
  errors: Record<string, string>
  dispatch: EditorDispatch
}) {
  return (
    <Card
      compacta
      titulo="Asunto e introducción"
      descripcion={
        state.formato === 'mensual'
          ? // La lista (Trabajo) muestra el asunto solo si no hay equipo ni ubicación: no se promete acá.
            'El PDF mensual no imprime el asunto ni la introducción.'
          : undefined
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Field id={ID_FIELD.asunto} label="Asunto" error={errors.asunto}>
            <Input
              id={ID_FIELD.asunto}
              value={state.asunto}
              placeholder="Sin asunto"
              onChange={(event) => dispatch({ tipo: 'campo', campo: 'asunto', value: event.target.value })}
              aria-invalid={Boolean(errors.asunto)}
            />
          </Field>
          <Variables text={state.asunto} />
        </div>
        <div className="space-y-1.5">
          <Field id={ID_FIELD.intro} label="Introducción" error={errors.intro}>
            <Textarea
              id={ID_FIELD.intro}
              value={state.intro}
              rows={3}
              placeholder="Sin introducción"
              onChange={(event) => dispatch({ tipo: 'campo', campo: 'intro', value: event.target.value })}
              aria-invalid={Boolean(errors.intro)}
              className="min-h-20 text-[15px] md:text-[15px]"
            />
          </Field>
          <Variables text={state.intro} />
        </div>
      </div>
    </Card>
  )
}
