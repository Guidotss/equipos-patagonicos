import { parsearFormato, type Segmento } from '@/lib/plantillas/formato'
import { esVariable, partirVariables, VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

/** Texto con las variables ({{capacidad}}) marcadas en amarillo: se completan en cada cotización. */
export function ConVariables({ texto }: { texto: string }) {
  return partirVariables(texto).map((parte, indice) =>
    indice % 2 === 0 ? (
      parte
    ) : (
      <mark
        key={indice}
        title={esVariable(parte) ? VARIABLES[parte] : 'Variable desconocida'}
        className="rounded-sm bg-brand-yellow/40 px-0.5 text-inherit"
      >
        {`{{${parte}}}`}
      </mark>
    ),
  )
}

/** Tramos de una línea con su negrita (**…**), cada uno con sus variables marcadas. */
export function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return segmentos.map((segmento, indice) =>
    segmento.negrita ? (
      <strong key={indice} className="font-semibold text-foreground">
        <ConVariables texto={segmento.texto} />
      </strong>
    ) : (
      <ConVariables key={indice} texto={segmento.texto} />
    ),
  )
}

/** El contenido de un bloque con el formato mínimo (viñetas y negritas), como en el PDF. */
export function TextoBloque({ contenido }: { contenido: string }) {
  return (
    <div className="space-y-1.5 text-[15px] text-foreground/80">
      {parsearFormato(contenido).map((nodo, indice) =>
        nodo.tipo === 'parrafo' ? (
          <p key={indice}>
            <Segmentos segmentos={nodo.segmentos} />
          </p>
        ) : (
          <p key={indice} className={cn('flex gap-2', nodo.nivel === 2 && 'pl-5')}>
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
