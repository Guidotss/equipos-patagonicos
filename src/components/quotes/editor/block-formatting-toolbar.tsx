import { Button } from '@/components/ui/button'
import { toggleBold, toggleBullet, removeIndent, type Editing, type TextSelection } from '@/lib/templates/editing'
import { Bold, List, ListIndentDecrease, ListIndentIncrease, type LucideIcon } from 'lucide-react'

type FormattingTool = {
  label: string
  shortcut?: string
  Icon: LucideIcon
  apply: (text: string, selection: TextSelection) => Editing
}

/** Solo lo que entiende el formato de texto y dibuja el PDF (decisión 5): sin itálica ni lista numerada. */
const TOOLS: FormattingTool[] = [
  { label: 'Negrita', shortcut: 'Ctrl+B', Icon: Bold, apply: toggleBold },
  { label: 'Viñeta', Icon: List, apply: (text, selection) => toggleBullet(text, selection, 1) },
  { label: 'Subviñeta', Icon: ListIndentIncrease, apply: (text, selection) => toggleBullet(text, selection, 2) },
  { label: 'Quitar sangría', Icon: ListIndentDecrease, apply: removeIndent },
]

const ICON_CLASS = 'text-muted-foreground'

export function BlockFormattingToolbar({
  number,
  id,
  edit,
}: {
  number: number
  id: string
  edit: (operation: (text: string, selection: TextSelection) => Editing) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Formato del bloque ${number}`}
      aria-controls={`${id}-contenido`}
      className="flex gap-0.5 border-b bg-muted/30 px-1.5 py-1"
    >
      {TOOLS.map(({ label, shortcut, Icon, apply }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICON_CLASS}
          aria-label={label}
          title={shortcut ? `${label} (${shortcut})` : label}
          // Sin esto el clic le saca el foco y la selección al texto.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => edit(apply)}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  )
}
