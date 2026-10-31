import { Button } from '@/components/ui/button'
import { alternarNegrita, alternarVineta, quitarSangria, type Editing, type Seleccion } from '@/lib/templates/editing'
import { Bold, List, ListIndentDecrease, ListIndentIncrease, type LucideIcon } from 'lucide-react'

type Herramienta = {
  label: string
  atajo?: string
  Icon: LucideIcon
  aplicar: (texto: string, seleccion: Seleccion) => Editing
}

/** Solo lo que entiende parsearFormato y dibuja el PDF (decisión 5): sin itálica ni lista numerada. */
const HERRAMIENTAS: Herramienta[] = [
  { label: 'Negrita', atajo: 'Ctrl+B', Icon: Bold, aplicar: alternarNegrita },
  { label: 'Viñeta', Icon: List, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 1) },
  { label: 'Subviñeta', Icon: ListIndentIncrease, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 2) },
  { label: 'Quitar sangría', Icon: ListIndentDecrease, aplicar: quitarSangria },
]

const ICONO = 'text-muted-foreground'

export function BlockFormattingToolbar({
  number,
  id,
  edit,
}: {
  number: number
  id: string
  edit: (operation: (text: string, selection: Seleccion) => Editing) => void
}) {
  const numero = number
  return (
    <div
      role="group"
      aria-label={`Formato del bloque ${numero}`}
      aria-controls={`${id}-contenido`}
      className="flex gap-0.5 border-b bg-muted/30 px-1.5 py-1"
    >
      {HERRAMIENTAS.map(({ label, atajo, Icon, aplicar: apply }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label={label}
          title={atajo ? `${label} (${atajo})` : label}
          // Sin esto el clic le saca el foco y la selección al texto.
          onMouseDown={(evento) => evento.preventDefault()}
          onClick={() => edit(apply)}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  )
}
