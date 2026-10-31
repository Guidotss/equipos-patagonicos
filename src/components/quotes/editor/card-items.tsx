'use client'
// src/components/cotizaciones/editor/tarjeta-items.tsx

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Card } from '@/components/form/card'
import { useSheetForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ItemEditor } from '@/lib/quotes/editor'
import type { Despachar } from '@/lib/quotes/editor-screen'
import {
  destinationFoco,
  rowsGrid,
  nameSectionNew,
  normalizePrice,
  totalGeneral,
  totalLine,
  vecinoOnQuitar,
  type FieldGrid,
  type ErrorsItem,
  type RowSection,
  type PedidoFoco,
} from '@/lib/quotes/grid'
import { formatAmountTable, parsePrice } from '@/lib/format/amounts'
import { UNIDADES, type Format, type Unit } from '@/lib/templates/content'
import { cn } from '@/lib/utils'

/** Una línea desde 44rem de ancho propio; Precio y Total admiten "39.000.000,00" sin recortar. */
const COLUMNAS = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_8rem_6rem_7rem]'
const COLUMNS_TEMPLATE = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_6rem]'

/** Cifras de la línea de un ítem desde 44rem: un punto más chicas que la descripción para que entren los montos. */
const CIFRA = '@min-[44rem]:text-[13px]'

/** Los campos siempre muestran su contorno; el ancho del contenedor define la densidad de la grilla. */
const CAMPO = 'h-11 border-input bg-background shadow-none @min-[44rem]:h-10'

/** Espacio toma y suelta; Enter queda para abrir el menú del agarre. */
const TECLAS = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

const INSTRUCCIONES: ScreenReaderInstructions = {
  draggable:
    'Para mover el ítem, presioná Espacio, movelo con las flechas y presioná Espacio para soltarlo; Escape cancela. ' +
    'Enter abre las opciones.',
}

/**
 * Avisa que el nombre de una sección (por la clave de su primer ítem) tiene un borrador sin aplicar, con la función que
 * lo aplica, o que dejó de tenerlo (null).
 */
export type OnChangeDraftSection = (clave: string, apply: (() => void) | null) => void

/**
 * Encabezado editable de una sección. El nombre se aplica al salir del campo o con Enter, no en cada tecla:
 * renombrarSeccion junta el grupo con el vecino si quedan con el mismo nombre, y a mitad de escribir
 * ("Precios Jornada Adicional" → "Precios Jornada") el encabezado desaparecería con el foco adentro.
 * Mientras tanto el borrador cuenta como cambio sin guardar: se registra arriba con su `aplicar`, que habilita Guardar
 * y que guardar (el botón o Ctrl/⌘+S) llama antes de leer el estado. Así no depende de que el blur del clic llegue antes
 * que el click (no está verificado en Safari ni en iOS).
 */
function HeaderSection({
  fila: row,
  error,
  despachar,
  onChangeDraft,
}: {
  fila: RowSection
  error?: string
  despachar: Despachar
  onChangeDraft: OnChangeDraftSection
}) {
  const id = `seccion-${row.clave}`
  const [draft, setDraft] = useState<string | null>(null)
  const pending = draft !== null && draft !== row.seccion

  function apply() {
    if (draft !== null && draft !== row.seccion) {
      despachar({ tipo: 'renombrarSeccion', clave: row.clave, seccion: draft })
    }
    setDraft(null)
  }

  // El registro del editor llama al aplicar del último render: el que tiene el borrador que se ve.
  const applyCurrent = useRef(apply)
  useLayoutEffect(() => {
    applyCurrent.current = apply
  })

  // También al desmontarse con el borrador a medio escribir (la limpieza lo retira).
  useEffect(() => {
    if (!pending) return
    onChangeDraft(row.clave, () => applyCurrent.current())
    return () => onChangeDraft(row.clave, null)
  }, [pending, row.clave, onChangeDraft])

  return (
    <div className="border-b bg-muted/60 p-3 @min-[44rem]:pl-12">
      <Input
        id={id}
        aria-label={`Nombre de la sección ${row.numero}`}
        value={draft ?? row.seccion}
        maxLength={100}
        // Una sección sin nombre sale como "Precios:" en el PDF por jornada.
        placeholder="Precios"
        onChange={(evento) => setDraft(evento.target.value)}
        onBlur={apply}
        onKeyDown={(evento) => {
          // Ctrl/⌘+S lo maneja el editor: guardar aplica antes los borradores registrados.
          if (evento.nativeEvent.isComposing || evento.key !== 'Enter') return
          evento.preventDefault()
          apply()
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CAMPO, 'max-w-md px-2.5 font-semibold')}
      />
      {error ? (
        <p id={`${id}-error`} className="px-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type FieldItem = Exclude<FieldGrid, 'seccion'>

function RowItem({
  item,
  index,
  quantityItems,
  errors,
  despachar,
  onEnter,
  onMove,
  onDuplicate,
  onQuitar,
  editPrices,
}: {
  item: ItemEditor
  index: number
  quantityItems: number
  /** Los errores de guardado de esta fila (por clave, no por posición: ver TarjetaItems). */
  errors: ErrorsItem
  despachar: Despachar
  onEnter: () => void
  onMove: (paso: -1 | 1) => void
  onDuplicate: () => void
  onQuitar: () => void
  editPrices: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.clave,
    attributes: { roleDescription: 'ítem ordenable' },
  })
  const [menuOpen, setMenuOpen] = useState(false)
  // Mientras se escribe el precio se ve tal cual; fuera del campo, con formato ("1.950.000,00"), venga de donde venga
  // (lo cargado de la base llega como "1.950.000", textoPrecio de la Task 3). Se pasa a "escribiendo" con la primera
  // tecla y no al enfocar: si el texto cambiara al entrar con Tab, React reasignaría el valor, se perdería la
  // selección del navegador y lo tipeado se agregaría al precio en vez de reemplazarlo.
  const [editandoPrice, setEditandoPrice] = useState(false)
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
  const id = `item-${item.clave}`
  const error = (field: FieldItem) => errors[field]
  const messages = (['descripcion', 'cantidad', 'precio', 'unidad'] as const).map(error).filter(Boolean)
  const describir = (field: FieldItem) => (error(field) ? `${id}-error` : undefined)
  const priceMalWritten = item.precio.trim() !== '' && parsePrice(item.precio) === null
  const total = totalLine(item)
  const change = (changes: Partial<Omit<ItemEditor, 'clave'>>) => despachar({ tipo: 'item', clave: item.clave, changes })

  // Enter (sin Shift, que deja escribir un salto en la descripción) agrega una fila debajo y la enfoca.
  function onTeclear(evento: React.KeyboardEvent) {
    if (evento.key !== 'Enter' || evento.shiftKey || evento.nativeEvent.isComposing) return
    evento.preventDefault()
    onEnter()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative mx-3 my-3 grid grid-cols-2 items-start gap-x-3 gap-y-3 rounded-lg border bg-card px-3 pb-4 @min-[44rem]:m-0 @min-[44rem]:gap-x-2 @min-[44rem]:gap-y-2 @min-[44rem]:rounded-none @min-[44rem]:border-0 @min-[44rem]:border-b @min-[44rem]:py-3',
        editPrices ? COLUMNAS : COLUMNS_TEMPLATE,
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
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

      <div className="col-span-2 col-start-1 row-start-1 min-w-0 space-y-1.5 @min-[44rem]:col-span-1 @min-[44rem]:col-start-auto @min-[44rem]:row-start-auto @min-[44rem]:space-y-0">
        <Label htmlFor={`${id}-descripcion`} className="flex h-11 items-center pr-12 @min-[44rem]:hidden">
          Descripción
        </Label>
        <Textarea
          id={`${id}-descripcion`}
          aria-label={`Descripción del ítem ${numero}`}
          rows={1}
          value={item.descripcion}
          placeholder="Descripción"
          onChange={(evento) => change({ descripcion: evento.target.value })}
          onKeyDown={onTeclear}
          aria-invalid={Boolean(error('descripcion'))}
          aria-describedby={describir('descripcion')}
          className="min-h-11 resize-none border-input bg-background px-2.5 py-2.5 shadow-none @min-[44rem]:min-h-10 @min-[44rem]:py-2"
        />
      </div>

      {/* Angosta: Cantidad/Unidad y Precio/Total forman dos filas. El orden de teclado conserva Cantidad/Precio/Unidad. */}
      <div className="col-span-2 grid grid-cols-2 gap-3 @min-[44rem]:contents">
        <div className="order-1 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
          <Label htmlFor={`${id}-cantidad`} className="@min-[44rem]:hidden">Cantidad</Label>
          <Input
            id={`${id}-cantidad`}
            aria-label={`Cantidad del ítem ${numero}`}
            inputMode="decimal"
            value={item.cantidad}
            onChange={(evento) => change({ cantidad: evento.target.value })}
            onKeyDown={onTeclear}
            aria-invalid={Boolean(error('cantidad'))}
            aria-describedby={describir('cantidad')}
            className={cn(CAMPO, 'px-2 tabular-nums', CIFRA)}
          />
        </div>
        {editPrices ? (
          <div className="order-3 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <Label htmlFor={`${id}-precio`} className="@min-[44rem]:hidden">Precio unitario</Label>
            <Input
              id={`${id}-precio`}
              aria-label={`Precio del ítem ${numero}`}
              inputMode="decimal"
              value={editandoPrice ? item.precio : normalizePrice(item.precio)}
              placeholder="Sin precio"
              onChange={(evento) => {
                setEditandoPrice(true)
                change({ precio: evento.target.value })
              }}
              onBlur={() => {
                setEditandoPrice(false)
                const normal = normalizePrice(item.precio)
                if (normal !== item.precio) change({ precio: normal })
              }}
              onKeyDown={onTeclear}
              aria-invalid={Boolean(error('precio')) || priceMalWritten}
              aria-describedby={describir('precio')}
              className={cn(
                CAMPO,
                'px-2 text-right tabular-nums',
                item.precio.trim() === '' && 'border-brand-yellow/70 bg-brand-yellow/10',
                CIFRA,
              )}
            />
          </div>
        ) : null}
        <div className="order-2 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
          <Label htmlFor={`${id}-unidad`} className="@min-[44rem]:hidden">Unidad</Label>
          <NativeSelect
            id={`${id}-unidad`}
            aria-label={`Unidad del ítem ${numero}`}
            value={item.unidad}
            onChange={(evento) => change({ unidad: evento.target.value as Unit })}
            aria-invalid={Boolean(error('unidad'))}
            aria-describedby={describir('unidad')}
            // La columna de 6rem mantiene "JORNADA" completa con su flecha.
            className="w-full [&_[data-slot=native-select-icon]]:right-1.5 [&_select]:h-11 [&_select]:bg-background [&_select]:pr-6 [&_select]:pl-2 @min-[44rem]:[&_select]:h-10 @min-[44rem]:[&_select]:text-xs"
          >
            {UNIDADES.map((unidad) => (
              <NativeSelectOption key={unidad} value={unidad}>
                {unidad}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {editPrices ? (
          <div className="order-4 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <p className="text-sm font-medium @min-[44rem]:hidden">Total del ítem</p>
            <output
              htmlFor={`${id}-cantidad ${id}-precio`}
              aria-label={`Total del ítem ${numero}`}
              className={cn('flex min-h-11 items-center justify-end rounded-lg bg-muted/60 px-2 text-right text-sm font-semibold tabular-nums @min-[44rem]:min-h-10 @min-[44rem]:bg-transparent @min-[44rem]:px-0', CIFRA)}
            >
              {total === null ? '—' : formatAmountTable(total)}
            </output>
          </div>
        ) : null}
      </div>

      {messages.length ? (
        <p id={`${id}-error`} className="col-span-2 text-sm text-destructive @min-[44rem]:col-span-full @min-[44rem]:col-start-2">
          {messages.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

export function CardItems({
  items,
  formato,
  mostrarTotal: showTotal,
  errors,
  despachar,
  onChangeDraftSection,
  editPrices = true,
}: {
  items: ItemEditor[]
  formato: Format
  mostrarTotal: boolean
  /**
   * Errores de guardado por clave de ítem. EditorCotizacion los pasa de 'items.N.campo' a claves al guardar, con las
   * claves de los ítems que mandó: la marca queda en el ítem que la tuvo aunque mientras se guardaba o después se
   * agreguen, dupliquen, muevan o borren otros.
   */
  errors: Record<string, ErrorsItem>
  despachar: Despachar
  /** Un nombre de sección escrito y todavía no aplicado: el editor lo cuenta como cambio sin guardar. */
  onChangeDraftSection: OnChangeDraftSection
  /** Las plantillas guardan descripciones, cantidades y unidades; los precios se definen al cotizar. */
  editPrices?: boolean
}) {
  const idDnd = useId()
  const inSheet = useSheetForm()
  const foco = useRef<PedidoFoco | 'agregar' | null>(null)
  const buttonAgregar = useRef<HTMLButtonElement>(null)
  const sensores = useSensors(
    // 4 px de movimiento antes de arrastrar: un clic en el agarre abre el menú.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: TECLAS }),
  )
  const rows = rowsGrid(items)
  const { total, withoutPrice } = totalGeneral(items)

  // Después de agregar, duplicar o borrar, el foco va a la fila que corresponde (las claves las pone el reducer).
  useEffect(() => {
    const pedido = foco.current
    if (!pedido) return
    foco.current = null
    if (pedido === 'agregar') {
      buttonAgregar.current?.focus()
      return
    }
    const destination = destinationFoco(pedido, items)
    if (!destination) return
    const element = document.getElementById(
      destination.campo === 'seccion' ? `seccion-${destination.clave}` : `item-${destination.clave}-descripcion`,
    )
    element?.focus()
    if (destination.campo === 'seccion' && element instanceof HTMLInputElement) element.select()
  }, [items])

  // Si el ítem cae en el medio de otro grupo, el reducer le pone esa sección (Task 3).
  function move(desde: number, hasta: number) {
    if (desde === hasta || hasta < 0 || hasta >= items.length) return
    despachar({ tipo: 'moverItem', desde, hasta })
  }

  function agregarDespuesOf(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'agregarItem', despuesOf: item.clave, seccion: item.seccion })
  }

  function agregarOnFinal() {
    foco.current = { tipo: 'ultimo' }
    despachar({ tipo: 'agregarItem', seccion: items.at(-1)?.seccion ?? '' })
  }

  function agregarSection() {
    foco.current = { tipo: 'seccionUltima' }
    despachar({ tipo: 'agregarSeccion', nombre: nameSectionNew(items) })
  }

  function duplicate(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'duplicarItem', clave: item.clave })
  }

  function quitar(item: ItemEditor) {
    const vecino = vecinoOnQuitar(items, item.clave)
    foco.current = vecino ? { tipo: 'item', clave: vecino } : 'agregar'
    despachar({ tipo: 'quitarItem', clave: item.clave })
  }

  function onSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    move(
      items.findIndex((item) => item.clave === active.id),
      items.findIndex((item) => item.clave === over.id),
    )
  }

  const position = (id: UniqueIdentifier) => items.findIndex((item) => item.clave === id) + 1
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste el ítem ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `El ítem ${position(active.id)} pasa a la posición ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste el ítem ${position(active.id)} en la posición ${position(over.id)}.`
        : `Soltaste el ítem ${position(active.id)}.`,
    onDragCancel: ({ active }) => `Se canceló el movimiento del ítem ${position(active.id)}.`,
  }

  return (
    <Card compacta titulo="Ítems" descripcion={editPrices ? 'Definí los conceptos, cantidades y precios del servicio.' : 'Los precios se completan en cada cotización.'}>
      <div className={cn('overflow-hidden rounded-lg border', !inSheet && '-mx-1')}>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[15px] text-muted-foreground">Todavía no hay ítems.</p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                'hidden h-11 items-center gap-x-2 border-b bg-muted/30 px-3 text-xs font-medium text-muted-foreground @min-[44rem]:grid',
                editPrices ? COLUMNAS : COLUMNS_TEMPLATE,
              )}
            >
              <span />
              <span className="pl-2.5">Descripción</span>
              <span className="pl-1">Cantidad</span>
              {editPrices ? <span className="pr-2 text-right">Precio unitario</span> : null}
              <span className="pl-2">Unidad</span>
              {editPrices ? <span className="text-right">Total</span> : null}
            </div>
            <DndContext
              id={idDnd}
              sensors={sensores}
              collisionDetection={closestCenter}
              onDragEnd={onSoltar}
              accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCCIONES }}
            >
              <SortableContext items={items.map((item) => item.clave)} strategy={verticalListSortingStrategy}>
                {rows.map((row) =>
                  row.tipo === 'seccion' ? (
                    <HeaderSection
                      key={`seccion-${row.clave}`}
                      fila={row}
                      error={errors[row.clave]?.seccion}
                      despachar={despachar}
                      onChangeDraft={onChangeDraftSection}
                    />
                  ) : (
                    <RowItem
                      key={items[row.index].clave}
                      item={items[row.index]}
                      index={row.index}
                      quantityItems={items.length}
                      errors={errors[items[row.index].clave] ?? {}}
                      despachar={despachar}
                      onEnter={() => agregarDespuesOf(items[row.index])}
                      onMove={(paso) => move(row.index, row.index + paso)}
                      onDuplicate={() => duplicate(items[row.index])}
                      onQuitar={() => quitar(items[row.index])}
                      editPrices={editPrices}
                    />
                  ),
                )}
              </SortableContext>
            </DndContext>
            {editPrices && showTotal ? (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t bg-muted/30 px-3 py-3 text-sm @min-[44rem]:justify-end @min-[44rem]:border-t-0 @min-[44rem]:border-b">
                <span className="font-medium">Total</span>
                {total === null ? (
                  <span className="text-muted-foreground">
                    {withoutPrice > 0
                      ? `Falta el precio de ${withoutPrice === 1 ? '1 ítem' : `${withoutPrice} ítems`}`
                      : 'Revisá las cantidades'}
                  </span>
                ) : (
                  <span className="min-w-24 text-right font-medium tabular-nums">{formatAmountTable(total)}</span>
                )}
              </div>
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-2 border-t px-3 py-3 @min-[44rem]:flex-row @min-[44rem]:items-center @min-[44rem]:justify-between @min-[44rem]:border-t-0">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <Button ref={buttonAgregar} type="button" variant="ghost" size="sm" className="h-11 text-primary @min-[44rem]:h-9" onClick={agregarOnFinal}>
              <Plus aria-hidden />
              Agregar ítem
            </Button>
            {/* Las secciones solo se imprimen en el formato por jornada. */}
            {formato === 'jornada' ? (
              <Button type="button" variant="ghost" size="sm" className="h-11 text-primary @min-[44rem]:h-9" onClick={agregarSection}>
                <Plus aria-hidden />
                Agregar sección
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-11 shrink-0 items-center gap-2 @min-[44rem]:min-h-9">
            <Switch
              id="cotizacion-mostrar-total"
              checked={showTotal}
              onCheckedChange={(value) => despachar({ tipo: 'mostrarTotal', value })}
            />
            <Label htmlFor="cotizacion-mostrar-total" className="text-sm font-normal">
              Total en el PDF
            </Label>
          </div>
        </div>
      </div>
    </Card>
  )
}
