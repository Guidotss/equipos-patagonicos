'use client'
// src/components/cotizaciones/editor/tarjeta-asunto.tsx

import { Campo } from '@/components/formulario/campo'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { ConVariables } from '@/components/plantillas/texto-formateado'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { ID_CAMPO, type Despachar } from '@/lib/cotizaciones/editor-pantalla'
import { variablesUsadas } from '@/lib/plantillas/variables'

/** Debajo del campo: el texto con sus variables marcadas, para ver qué se completa solo. */
function Variables({ texto }: { texto: string }) {
  if (variablesUsadas(texto).length === 0) return null
  return (
    <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
      <ConVariables texto={texto} />
    </p>
  )
}

export function TarjetaAsunto({
  estado,
  errores,
  despachar,
}: {
  estado: EstadoEditor
  errores: Record<string, string>
  despachar: Despachar
}) {
  return (
    <Tarjeta
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
          <Campo id={ID_CAMPO.asunto} etiqueta="Asunto" error={errores.asunto}>
            <Input
              id={ID_CAMPO.asunto}
              value={estado.asunto}
              placeholder="Sin asunto"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'asunto', valor: evento.target.value })}
              aria-invalid={Boolean(errores.asunto)}
            />
          </Campo>
          <Variables texto={estado.asunto} />
        </div>
        <div className="space-y-1.5">
          <Campo id={ID_CAMPO.intro} etiqueta="Introducción" error={errores.intro}>
            <Textarea
              id={ID_CAMPO.intro}
              value={estado.intro}
              rows={3}
              placeholder="Sin introducción"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'intro', valor: evento.target.value })}
              aria-invalid={Boolean(errores.intro)}
              className="min-h-20 text-[15px] md:text-[15px]"
            />
          </Campo>
          <Variables texto={estado.intro} />
        </div>
      </div>
    </Tarjeta>
  )
}
