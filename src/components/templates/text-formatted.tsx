import { parsearFormat, type Segmento } from '@/lib/templates/format'
import { isVariable, partirVariables, VARIABLES } from '@/lib/templates/variables'
import { cn } from '@/lib/utils'

/** Texto con las variables ({{capacidad}}) marcadas en amarillo: se completan en cada cotización. */
export function WithVariables({ texto }: { texto: string }) {
  return partirVariables(texto).map((parte, index) =>
    index % 2 === 0 ? (
      parte
    ) : (
      <mark
        key={index}
        title={isVariable(parte) ? VARIABLES[parte] : 'Variable desconocida'}
        className="rounded-sm bg-brand-yellow/40 px-0.5 text-inherit"
      >
        {`{{${parte}}}`}
      </mark>
    ),
  )
}

/** Tramos de una línea con su negrita (**…**), cada uno con sus variables marcadas. */
export function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return segmentos.map((segmento, index) =>
    segmento.negrita ? (
      <strong key={index} className="font-semibold text-foreground">
        <WithVariables texto={segmento.texto} />
      </strong>
    ) : (
      <WithVariables key={index} texto={segmento.texto} />
    ),
  )
}

/** El contenido de un bloque con el formato mínimo (viñetas y negritas), como en el PDF. */
export function TextBlock({ contenido: content }: { contenido: string }) {
  return (
    <div className="space-y-1.5 text-[15px] text-foreground/80">
      {parsearFormat(content).map((nodo, index) =>
        nodo.tipo === 'parrafo' ? (
          <p key={index}>
            <Segmentos segmentos={nodo.segmentos} />
          </p>
        ) : (
          <p key={index} className={cn('flex gap-2', nodo.nivel === 2 && 'pl-5')}>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              {nodo.nivel === 1 ? '-' : '•'}
            </span>
            <span className="min-w-0">
              <Segmentos segmentos={nodo.segmentos} />
            </span>
          </p>
        ),
      )}
    </div>
  )
}
