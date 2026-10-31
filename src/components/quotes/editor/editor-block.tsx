import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pill } from '@/components/ui/pill'
import { Textarea } from '@/components/ui/textarea'
import type { Despachar, ErrorsBlock } from '@/lib/quotes/editor-screen'
import type { BlockEditor } from '@/lib/quotes/editor/types'
import type { Block } from '@/lib/templates/content'
import {
  alternarNegrita,
  limpiarPegado,
  pegar,
  tramoCambiado,
  type Editing,
  type Seleccion,
} from '@/lib/templates/editing'
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { BlockFormattingToolbar } from './block-formatting-toolbar'

const ICONO = 'text-muted-foreground'

/**
 * Reemplaza la selección del textarea enfocado con insertText, como lo haría el usuario: entra en el historial del
 * textarea (Ctrl/⌘+Z lo deshace) y dispara input, que React toma por onChange. false si el navegador no lo soporta.
 */
function replaceSeleccion(reemplazo: string): boolean {
  return reemplazo === '' ? document.execCommand('delete') : document.execCommand('insertText', false, reemplazo)
}

export function EditorBlock({
  bloque: block,
  index,
  total,
  original,
  errors,
  despachar,
}: {
  bloque: BlockEditor
  index: number
  total: number
  /** El bloque de la plantilla con el mismo título (y número de aparición), si existe. */
  original: Block | null
  /** Los errores de guardado de este bloque (por su clave: siguen acá aunque se mueva). */
  errors: ErrorsBlock
  despachar: Despachar
}) {
  const numero = index + 1
  const id = `bloque-${block.clave}`
  const nombre = block.titulo.trim() || `Bloque ${numero}`
  const area = useRef<HTMLTextAreaElement>(null)
  // Selección a marcar cuando el reducer aplique el texto editado.
  const seleccionPending = useRef<Seleccion | null>(null)
  // Al ocultar el foco va a "Mostrar" y al mostrar vuelve a "Ocultar" (cada botón se monta de nuevo). Al subir o bajar,
  // sigue en el botón que se tocó: React mueve el nodo del bloque y el foco se perdería.
  const foco = useRef<'mostrar' | 'ocultar' | 'subir' | 'bajar' | null>(null)
  const buttonUpload = useRef<HTMLButtonElement>(null)
  const buttonBajar = useRef<HTMLButtonElement>(null)
  const [confirmando, setConfirmando] = useState(false)

  // Un bloque oculto (con "Ocultar" o por una versión nueva del servidor) no deja su confirmación abierta para cuando
  // vuelva a mostrarse.
  if (block.hidden && confirmando) setConfirmando(false)

  useLayoutEffect(() => {
    const seleccion = seleccionPending.current
    const element = area.current
    if (!seleccion || !element) return
    seleccionPending.current = null
    element.focus()
    element.setSelectionRange(seleccion.inicio, seleccion.fin)
  }, [block.contenido])

  useLayoutEffect(() => {
    const moved = foco.current
    if (moved !== 'subir' && moved !== 'bajar') return
    foco.current = null
    // En la punta, el botón que se tocó queda deshabilitado: el foco pasa al otro del mismo bloque.
    const [tocado, otro] =
      moved === 'subir' ? [buttonUpload.current, buttonBajar.current] : [buttonBajar.current, buttonUpload.current]
    const destination = tocado && !tocado.disabled ? tocado : otro
    destination?.focus()
  }, [index])

  const onMontarShow = useCallback((button: HTMLButtonElement | null) => {
    if (button && foco.current === 'mostrar') {
      foco.current = null
      button.focus()
    }
  }, [])
  const onMontarHide = useCallback((button: HTMLButtonElement | null) => {
    if (button && foco.current === 'ocultar') {
      foco.current = null
      button.focus()
    }
  }, [])

  const change = (changes: Partial<Omit<BlockEditor, 'clave'>>) =>
    despachar({ tipo: 'bloque', clave: block.clave, changes })

  /**
   * Aplica una edición de la barra (o Ctrl/⌘+B) con el mismo mecanismo que el pegado: elige el tramo que cambia y lo
   * reemplaza con insertText, así Ctrl/⌘+Z la deshace. Si el navegador no lo soporta, la aplica el reducer.
   */
  function edit(operacion: (texto: string, seleccion: Seleccion) => Editing) {
    const element = area.current
    if (!element) return
    const viejo = element.value
    const { texto, seleccion } = operacion(viejo, { inicio: element.selectionStart, fin: element.selectionEnd })
    // Con el teclado, el foco puede estar en el botón de la barra: insertText actúa sobre el elemento enfocado.
    element.focus()
    if (texto !== viejo) {
      const tramo = tramoCambiado(viejo, texto)
      element.setSelectionRange(tramo.inicio, tramo.fin)
      if (!replaceSeleccion(tramo.reemplazo)) {
        seleccionPending.current = seleccion
        change({ contenido: texto })
        return
      }
    }
    element.setSelectionRange(seleccion.inicio, seleccion.fin)
  }

  function cerrarConfirmation() {
    setConfirmando(false)
    requestAnimationFrame(() => area.current?.focus())
  }

  const errorTitle = errors.titulo
  const errorContent = errors.contenido
  const describir = errorTitle || errorContent ? `${id}-error` : undefined
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
          ref={onMontarShow}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            foco.current = 'ocultar'
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
      aria-label={nombre}
      className="overflow-hidden rounded-lg border transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          id={`${id}-titulo`}
          aria-label={`Título del bloque ${numero}`}
          value={block.titulo}
          placeholder="Sin título"
          onChange={(evento) => change({ titulo: evento.target.value })}
          aria-invalid={Boolean(errorTitle)}
          aria-describedby={describir}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[15px] font-medium shadow-none hover:border-input focus-visible:border-ring focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />
        <Button
          ref={buttonUpload}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Subir bloque"
          title="Subir bloque"
          disabled={index === 0}
          onClick={() => {
            foco.current = 'subir'
            despachar({ tipo: 'moverBloque', clave: block.clave, direccion: -1 })
          }}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          ref={buttonBajar}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Bajar bloque"
          title="Bajar bloque"
          disabled={index === total - 1}
          onClick={() => {
            foco.current = 'bajar'
            despachar({ tipo: 'moverBloque', clave: block.clave, direccion: 1 })
          }}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          ref={onMontarHide}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Ocultar en esta cotización"
          title="Ocultar en esta cotización (no sale en el PDF)"
          disabled={confirmando}
          onClick={() => {
            foco.current = 'mostrar'
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
            className={ICONO}
            aria-label="Restaurar este bloque"
            title="Restaurar este bloque desde la plantilla"
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </div>

      {confirmando && original ? (
        <ConfirmationInLugar
          className="m-2"
          tone="aviso"
          pregunta="¿Restaurar este bloque desde la plantilla?"
          detail="Se pierden los cambios hechos en su texto."
          textConfirm="Restaurar"
          onConfirm={() => {
            change({ titulo: original.titulo, contenido: original.contenido, hidden: false })
            cerrarConfirmation()
          }}
          onCancelar={cerrarConfirmation}
        />
      ) : null}

      <BlockFormattingToolbar number={numero} id={id} edit={edit} />

      <Textarea
        ref={area}
        id={`${id}-contenido`}
        aria-label={`Contenido del bloque ${numero}`}
        value={block.contenido}
        placeholder="Texto del bloque"
        onChange={(evento) => change({ contenido: evento.target.value })}
        onKeyDown={(evento) => {
          if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 'b') {
            evento.preventDefault()
            edit(alternarNegrita)
          }
        }}
        // Lo pegado desde Word llega como texto plano, pero con sus viñetas y tabs: se lleva al formato mínimo.
        onPaste={(evento) => {
          const pegado = evento.clipboardData.getData('text/plain')
          const limpio = limpiarPegado(pegado)
          // Si no hay nada que limpiar, el pegado nativo.
          if (!pegado || limpio === pegado) return
          evento.preventDefault()
          // insertText conserva Ctrl/⌘+Z (asignar el value por programa lo pierde) y dispara input, que React toma
          // por onChange. Si el navegador no lo soporta, se reemplaza el texto a mano.
          if (!document.execCommand('insertText', false, limpio)) {
            edit((texto, seleccion) => pegar(texto, seleccion, pegado))
          }
        }}
        aria-invalid={Boolean(errorContent)}
        aria-describedby={describir}
        className="min-h-20 resize-none rounded-none border-0 px-3 py-2.5 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
      />
      {describir ? (
        <p id={describir} className="border-t px-3 py-2 text-sm text-destructive">
          {[errorTitle, errorContent].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}
