import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pill } from '@/components/ui/pill'
import { Textarea } from '@/components/ui/textarea'
import type { EditorDispatch, ErrorsBlock } from '@/lib/quotes/editor-screen'
import type { BlockEditor } from '@/lib/quotes/editor/types'
import type { Block } from '@/lib/templates/content'
import {
  toggleBold,
  cleanPastedText,
  pasteText,
  changedRange,
  type Editing,
  type TextSelection,
} from '@/lib/templates/editing'
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { BlockFormattingToolbar } from './block-formatting-toolbar'

const ICON_CLASS = 'text-muted-foreground'

/**
 * Reemplaza la selección del textarea enfocado con insertText, como lo haría el usuario: entra en el historial del
 * textarea (Ctrl/⌘+Z lo deshace) y dispara input, que React toma por onChange. false si el navegador no lo soporta.
 */
function replaceSelection(replacement: string): boolean {
  return replacement === '' ? document.execCommand('delete') : document.execCommand('insertText', false, replacement)
}

export function EditorBlock({
  block,
  index,
  total,
  original,
  errors,
  dispatch,
}: {
  block: BlockEditor
  index: number
  total: number
  /** El bloque de la plantilla con el mismo título (y número de aparición), si existe. */
  original: Block | null
  /** Los errores de guardado de este bloque (por su clave: siguen acá aunque se mueva). */
  errors: ErrorsBlock
  dispatch: EditorDispatch
}) {
  const number = index + 1
  const id = `bloque-${block.clave}`
  const name = block.titulo.trim() || `Bloque ${number}`
  const area = useRef<HTMLTextAreaElement>(null)
  // Selección a marcar cuando el reducer aplique el texto editado.
  const pendingSelection = useRef<TextSelection | null>(null)
  // Al ocultar el foco va a "Mostrar" y al mostrar vuelve a "Ocultar" (cada botón se monta de nuevo). Al subir o bajar,
  // sigue en el botón que se tocó: React mueve el nodo del bloque y el foco se perdería.
  const focusTarget = useRef<'mostrar' | 'ocultar' | 'subir' | 'bajar' | null>(null)
  const moveUpButton = useRef<HTMLButtonElement>(null)
  const moveDownButton = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)

  // Un bloque oculto (con "Ocultar" o por una versión nueva del servidor) no deja su confirmación abierta para cuando
  // vuelva a mostrarse.
  if (block.hidden && confirming) setConfirming(false)

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    const element = area.current
    if (!selection || !element) return
    pendingSelection.current = null
    element.focus()
    element.setSelectionRange(selection.inicio, selection.fin)
  }, [block.contenido])

  useLayoutEffect(() => {
    const moved = focusTarget.current
    if (moved !== 'subir' && moved !== 'bajar') return
    focusTarget.current = null
    // En la punta, el botón que se tocó queda deshabilitado: el foco pasa al otro del mismo bloque.
    const [touched, other] =
      moved === 'subir' ? [moveUpButton.current, moveDownButton.current] : [moveDownButton.current, moveUpButton.current]
    const destination = touched && !touched.disabled ? touched : other
    destination?.focus()
  }, [index])

  const onShowMount = useCallback((button: HTMLButtonElement | null) => {
    if (button && focusTarget.current === 'mostrar') {
      focusTarget.current = null
      button.focus()
    }
  }, [])
  const onHideMount = useCallback((button: HTMLButtonElement | null) => {
    if (button && focusTarget.current === 'ocultar') {
      focusTarget.current = null
      button.focus()
    }
  }, [])

  const change = (changes: Partial<Omit<BlockEditor, 'clave'>>) =>
    dispatch({ tipo: 'bloque', clave: block.clave, changes })

  /**
   * Aplica una edición de la barra (o Ctrl/⌘+B) con el mismo mecanismo que el pegado: elige el tramo que cambia y lo
   * reemplaza con insertText, así Ctrl/⌘+Z la deshace. Si el navegador no lo soporta, la aplica el reducer.
   */
  function edit(operation: (text: string, selection: TextSelection) => Editing) {
    const element = area.current
    if (!element) return
    const previous = element.value
    const { texto: text, seleccion: selection } = operation(previous, { inicio: element.selectionStart, fin: element.selectionEnd })
    // Con el teclado, el foco puede estar en el botón de la barra: insertText actúa sobre el elemento enfocado.
    element.focus()
    if (text !== previous) {
      const segment = changedRange(previous, text)
      element.setSelectionRange(segment.inicio, segment.fin)
      if (!replaceSelection(segment.reemplazo)) {
        pendingSelection.current = selection
        change({ contenido: text })
        return
      }
    }
    element.setSelectionRange(selection.inicio, selection.fin)
  }

  function closeConfirmation() {
    setConfirming(false)
    requestAnimationFrame(() => area.current?.focus())
  }

  const errorTitle = errors.titulo
  const errorContent = errors.contenido
  const describe = errorTitle || errorContent ? `${id}-error` : undefined
  const canRestore = original !== null && original.contenido !== block.contenido

  if (block.hidden) {
    // El nombre accesible es el texto que se ve en la fila.
    const visible = block.titulo.trim() || 'Sin título'
    return (
      <article
        aria-label={visible}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2"
      >
        {/* Con min-w-32 la fila se parte en el celular en vez de achicar el título a nada. */}
        <span className="min-w-32 flex-1 truncate text-[15px] text-muted-foreground">{visible}</span>
        <Pill>Oculto en esta cotización</Pill>
        <Button
          ref={onShowMount}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            focusTarget.current = 'ocultar'
            change({ hidden: false })
          }}
        >
          <Eye aria-hidden />
          Mostrar
        </Button>
      </article>
    )
  }

  return (
    <article
      aria-label={name}
      className="overflow-hidden rounded-lg border transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          id={`${id}-titulo`}
          aria-label={`Título del bloque ${number}`}
          value={block.titulo}
          placeholder="Sin título"
          onChange={(event) => change({ titulo: event.target.value })}
          aria-invalid={Boolean(errorTitle)}
          aria-describedby={describe}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[15px] font-medium shadow-none hover:border-input focus-visible:border-ring focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />
        <Button
          ref={moveUpButton}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICON_CLASS}
          aria-label="Subir bloque"
          title="Subir bloque"
          disabled={index === 0}
          onClick={() => {
            focusTarget.current = 'subir'
            dispatch({ tipo: 'moverBloque', clave: block.clave, direccion: -1 })
          }}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          ref={moveDownButton}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICON_CLASS}
          aria-label="Bajar bloque"
          title="Bajar bloque"
          disabled={index === total - 1}
          onClick={() => {
            focusTarget.current = 'bajar'
            dispatch({ tipo: 'moverBloque', clave: block.clave, direccion: 1 })
          }}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          ref={onHideMount}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICON_CLASS}
          aria-label="Ocultar en esta cotización"
          title="Ocultar en esta cotización (no sale en el PDF)"
          disabled={confirming}
          onClick={() => {
            focusTarget.current = 'mostrar'
            change({ hidden: true })
          }}
        >
          <EyeOff aria-hidden />
        </Button>
        {canRestore ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={ICON_CLASS}
            aria-label="Restaurar este bloque"
            title="Restaurar este bloque desde la plantilla"
            disabled={confirming}
            onClick={() => setConfirming(true)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </div>

      {confirming && original ? (
        <InlineConfirmation
          className="m-2"
          tone="aviso"
          pregunta="¿Restaurar este bloque desde la plantilla?"
          detail="Se pierden los cambios hechos en su texto."
          textConfirm="Restaurar"
          onConfirm={() => {
            change({ titulo: original.titulo, contenido: original.contenido, hidden: false })
            closeConfirmation()
          }}
          onCancelar={closeConfirmation}
        />
      ) : null}

      <BlockFormattingToolbar number={number} id={id} edit={edit} />

      <Textarea
        ref={area}
        id={`${id}-contenido`}
        aria-label={`Contenido del bloque ${number}`}
        value={block.contenido}
        placeholder="Texto del bloque"
        onChange={(event) => change({ contenido: event.target.value })}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') {
            event.preventDefault()
            edit(toggleBold)
          }
        }}
        // Lo pegado desde Word llega como texto plano, pero con sus viñetas y tabs: se lleva al formato mínimo.
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text/plain')
          const clean = cleanPastedText(pasted)
          // Si no hay nada que limpiar, el pegado nativo.
          if (!pasted || clean === pasted) return
          event.preventDefault()
          // insertText conserva Ctrl/⌘+Z (asignar el value por programa lo pierde) y dispara input, que React toma
          // por onChange. Si el navegador no lo soporta, se reemplaza el texto a mano.
          if (!document.execCommand('insertText', false, clean)) {
            edit((text, selection) => pasteText(text, selection, pasted))
          }
        }}
        aria-invalid={Boolean(errorContent)}
        aria-describedby={describe}
        className="min-h-20 resize-none rounded-none border-0 px-3 py-2.5 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
      />
      {describe ? (
        <p id={describe} className="border-t px-3 py-2 text-sm text-destructive">
          {[errorTitle, errorContent].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}
