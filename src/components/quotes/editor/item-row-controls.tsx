import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { useSortable } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type SortableControls = Pick<
  ReturnType<typeof useSortable>,
  'attributes' | 'listeners' | 'setActivatorNodeRef' | 'isDragging'
>

export function ItemRowControls({
  index,
  quantityItems,
  onMove,
  onDuplicate,
  onQuitar,
  attributes,
  listeners,
  setActivatorNodeRef,
  isDragging,
}: SortableControls & {
  index: number
  quantityItems: number
  onMove: (step: -1 | 1) => void
  onDuplicate: () => void
  onQuitar: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Un clic sin mover abre el menú; el clic que llega al soltar después de arrastrar con el puntero, no. Arrastrar con
  // el teclado (Espacio) no termina en un clic: no marca nada, y el próximo clic (el de un lector de pantalla) abre.
  const huboArrastre = useRef(false)
  const withPuntero = useRef(false)
  // El menú estaba abierto al apoyar en el agarre: Radix lo cierra (es un clic afuera del menú) y el clic no lo reabre.
  const menuOpenOnApoyar = useRef(false)
  // Duplicar y Eliminar llevan el foco a otra fila: el menú no lo devuelve al agarre al cerrarse.
  const mantenerFoco = useRef(false)
  useEffect(() => {
    if (isDragging && withPuntero.current) huboArrastre.current = true
  }, [isDragging])

  const numero = index + 1
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Opciones del ítem ${numero}`}
          title="Arrastrá para mover; hacé clic para ver las opciones"
          className="relative z-10 col-start-2 row-start-1 size-11 cursor-grab touch-none justify-self-end text-muted-foreground active:cursor-grabbing @min-[44rem]:col-start-1 @min-[44rem]:row-start-auto @min-[44rem]:mt-1.5 @min-[44rem]:size-7"
          {...attributes}
          onPointerDown={(evento) => {
            huboArrastre.current = false
            withPuntero.current = true
            menuOpenOnApoyar.current = menuOpen
            // El preventDefault de abajo no deja que el foco se mueva solo: se pasa acá al agarre para que un nombre
            // de sección a medio escribir se aplique (con su blur) antes de que el arrastre cambie el primer ítem
            // del grupo y el encabezado, con su borrador, se vuelva a montar.
            evento.currentTarget.focus()
            listeners?.onPointerDown?.(evento)
            // Sin esto Radix abriría el menú al apoyar, antes de saber si es un arrastre.
            evento.preventDefault()
          }}
          onKeyDown={(evento) => {
            if (!isDragging) withPuntero.current = false
            listeners?.onKeyDown?.(evento)
            // Mientras se arrastra con el teclado, las flechas y Espacio son del arrastre, no del menú.
            if (isDragging) evento.preventDefault()
          }}
          onClick={() => {
            // Solo se ignoran el clic que sigue a un arrastre y el que cerró el menú abierto (si no, se cerraría y
            // se volvería a abrir). Los de detail 0 abren: así activa un lector de pantalla en modo exploración. El
            // teclado no duplica: Enter abre en el keydown (Radix) y lo previene, así que no genera clic, y el
            // keydown de Espacio lo previene el arrastre.
            const ignorar = huboArrastre.current || menuOpenOnApoyar.current
            huboArrastre.current = false
            menuOpenOnApoyar.current = false
            if (!ignorar) setMenuOpen(true)
          }}
        >
          <GripVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-44"
        onCloseAutoFocus={(evento) => {
          if (!mantenerFoco.current) return
          mantenerFoco.current = false
          evento.preventDefault()
        }}
      >
        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
          <ArrowUp aria-hidden />
          Subir
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === quantityItems - 1} onSelect={() => onMove(1)}>
          <ArrowDown aria-hidden />
          Bajar
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            mantenerFoco.current = true
            onDuplicate()
          }}
        >
          <Copy aria-hidden />
          Duplicar fila
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            mantenerFoco.current = true
            onQuitar()
          }}
        >
          <Trash2 aria-hidden />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
