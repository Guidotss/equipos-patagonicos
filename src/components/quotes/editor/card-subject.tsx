'use client'
// src/components/cotizaciones/editor/tarjeta-asunto.tsx

import { Field } from '@/components/form/field'
import { Card } from '@/components/form/card'
import { WithVariables } from '@/components/templates/text-formatted'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { StatusEditor } from '@/lib/quotes/editor/types'
import { ID_FIELD, type Despachar } from '@/lib/quotes/editor-screen'
import { variablesUsadas } from '@/lib/templates/variables'

/** Debajo del campo: el texto con sus variables marcadas, para ver qué se completa solo. */
function Variables({ texto }: { texto: string }) {
  if (variablesUsadas(texto).length === 0) return null
  return (
    <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
      <WithVariables texto={texto} />
    </p>
  )
}

export function CardSubject({
  estado,
  errors,
  despachar,
}: {
  estado: StatusEditor
  errors: Record<string, string>
  despachar: Despachar
}) {
  return (
    <Card
      compacta
      titulo="Asunto e introducción"
      descripcion={
        estado.formato === 'mensual'
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
              value={estado.asunto}
              placeholder="Sin asunto"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'asunto', value: evento.target.value })}
              aria-invalid={Boolean(errors.asunto)}
            />
          </Field>
          <Variables texto={estado.asunto} />
        </div>
        <div className="space-y-1.5">
          <Field id={ID_FIELD.intro} label="Introducción" error={errors.intro}>
            <Textarea
              id={ID_FIELD.intro}
              value={estado.intro}
              rows={3}
              placeholder="Sin introducción"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'intro', value: evento.target.value })}
              aria-invalid={Boolean(errors.intro)}
              className="min-h-20 text-[15px] md:text-[15px]"
            />
          </Field>
          <Variables texto={estado.intro} />
        </div>
      </div>
    </Card>
  )
}
