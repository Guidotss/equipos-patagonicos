import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { formatAmountTable, parsePrice } from '@/lib/format/amounts'
import type { EditorDispatch } from '@/lib/quotes/editor-screen'
import type { ItemEditor } from '@/lib/quotes/editor/types'
import { normalizePrice, totalLine, type ErrorsItem, type FieldGrid } from '@/lib/quotes/grid'
import { UNITS, type Unit } from '@/lib/templates/content'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'

import { ItemRowControls } from './item-row-controls'
import { ITEM_INPUT_CLASS, ITEM_NUMBER_CLASS, ITEM_COLUMNS, TEMPLATE_ITEM_COLUMNS } from './items-grid.constants'

type FieldItem = Exclude<FieldGrid, 'seccion'>

export function RowItem({
  item,
  index,
  quantityItems,
  errors,
  dispatch,
  onEnter,
  onMove,
  onDuplicate,
  onRemove,
  editPrices,
}: {
  item: ItemEditor
  index: number
  quantityItems: number
  /** Los errores de guardado de esta fila (por clave, no por posición: ver CardItems). */
  errors: ErrorsItem
  dispatch: EditorDispatch
  onEnter: () => void
  onMove: (step: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
  editPrices: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.clave,
    attributes: { roleDescription: 'ítem ordenable' },
  })
  // Mientras se escribe el precio se ve tal cual; fuera del campo, con formato ("1.950.000,00"), venga de donde venga
  // (lo cargado de la base llega como "1.950.000", textPrice de la Task 3). Se pasa a "escribiendo" con la primera
  // tecla y no al enfocar: si el texto cambiara al entrar con Tab, React reasignaría el valor, se perdería la
  // selección del navegador y lo tipeado se agregaría al precio en vez de reemplazarlo.
  const [editingPrice, setEditingPrice] = useState(false)
  const number = index + 1
  const id = `item-${item.clave}`
  const error = (field: FieldItem) => errors[field]
  const messages = (['descripcion', 'cantidad', 'precio', 'unidad'] as const).map(error).filter(Boolean)
  const describe = (field: FieldItem) => (error(field) ? `${id}-error` : undefined)
  const invalidPrice = item.precio.trim() !== '' && parsePrice(item.precio) === null
  const total = totalLine(item)
  const change = (changes: Partial<Omit<ItemEditor, 'clave'>>) =>
    dispatch({ tipo: 'item', clave: item.clave, changes })

  // Enter (sin Shift, que deja escribir un salto en la descripción) agrega una fila debajo y la enfoca.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    onEnter()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative mx-3 my-3 grid grid-cols-2 items-start gap-x-3 gap-y-3 rounded-lg border bg-card px-3 pb-4 @min-[44rem]:m-0 @min-[44rem]:gap-x-2 @min-[44rem]:gap-y-2 @min-[44rem]:rounded-none @min-[44rem]:border-0 @min-[44rem]:border-b @min-[44rem]:py-3',
        editPrices ? ITEM_COLUMNS : TEMPLATE_ITEM_COLUMNS,
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <ItemRowControls
        index={index}
        quantityItems={quantityItems}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        attributes={attributes}
        listeners={listeners}
        setActivatorNodeRef={setActivatorNodeRef}
        isDragging={isDragging}
      />

      <div className="col-span-2 col-start-1 row-start-1 min-w-0 space-y-1.5 @min-[44rem]:col-span-1 @min-[44rem]:col-start-auto @min-[44rem]:row-start-auto @min-[44rem]:space-y-0">
        <Label htmlFor={`${id}-descripcion`} className="flex h-11 items-center pr-12 @min-[44rem]:hidden">
          Descripción
        </Label>
        <Textarea
          id={`${id}-descripcion`}
          aria-label={`Descripción del ítem ${number}`}
          rows={1}
          value={item.descripcion}
          placeholder="Descripción"
          onChange={(event) => change({ descripcion: event.target.value })}
          onKeyDown={onKeyDown}
          aria-invalid={Boolean(error('descripcion'))}
          aria-describedby={describe('descripcion')}
          className="min-h-11 resize-none border-input bg-background px-2.5 py-2.5 shadow-none @min-[44rem]:min-h-10 @min-[44rem]:py-2"
        />
      </div>

      {/* Angosta: Cantidad/Unidad y Precio/Total forman dos filas. El orden de teclado conserva Cantidad/Precio/Unidad. */}
      <div className="col-span-2 grid grid-cols-2 gap-3 @min-[44rem]:contents">
        <div className="order-1 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
          <Label htmlFor={`${id}-cantidad`} className="@min-[44rem]:hidden">
            Cantidad
          </Label>
          <Input
            id={`${id}-cantidad`}
            aria-label={`Cantidad del ítem ${number}`}
            inputMode="decimal"
            value={item.cantidad}
            onChange={(event) => change({ cantidad: event.target.value })}
            onKeyDown={onKeyDown}
            aria-invalid={Boolean(error('cantidad'))}
            aria-describedby={describe('cantidad')}
            className={cn(ITEM_INPUT_CLASS, 'px-2 tabular-nums', ITEM_NUMBER_CLASS)}
          />
        </div>
        {editPrices ? (
          <div className="order-3 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <Label htmlFor={`${id}-precio`} className="@min-[44rem]:hidden">
              Precio unitario
            </Label>
            <Input
              id={`${id}-precio`}
              aria-label={`Precio del ítem ${number}`}
              inputMode="decimal"
              value={editingPrice ? item.precio : normalizePrice(item.precio)}
              placeholder="Sin precio"
              onChange={(event) => {
                setEditingPrice(true)
                change({ precio: event.target.value })
              }}
              onBlur={() => {
                setEditingPrice(false)
                const normal = normalizePrice(item.precio)
                if (normal !== item.precio) change({ precio: normal })
              }}
              onKeyDown={onKeyDown}
              aria-invalid={Boolean(error('precio')) || invalidPrice}
              aria-describedby={describe('precio')}
              className={cn(
                ITEM_INPUT_CLASS,
                'px-2 text-right tabular-nums',
                item.precio.trim() === '' && 'border-brand-yellow/70 bg-brand-yellow/10',
                ITEM_NUMBER_CLASS,
              )}
            />
          </div>
        ) : null}
        <div className="order-2 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
          <Label htmlFor={`${id}-unidad`} className="@min-[44rem]:hidden">
            Unidad
          </Label>
          <NativeSelect
            id={`${id}-unidad`}
            aria-label={`Unidad del ítem ${number}`}
            value={item.unidad}
            onChange={(event) => change({ unidad: event.target.value as Unit })}
            aria-invalid={Boolean(error('unidad'))}
            aria-describedby={describe('unidad')}
            // La columna de 6rem mantiene "JORNADA" completa con su flecha.
            className="w-full [&_[data-slot=native-select-icon]]:right-1.5 [&_select]:h-11 [&_select]:bg-background [&_select]:pr-6 [&_select]:pl-2 @min-[44rem]:[&_select]:h-10 @min-[44rem]:[&_select]:text-xs"
          >
            {UNITS.map((unit) => (
              <NativeSelectOption key={unit} value={unit}>
                {unit}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {editPrices ? (
          <div className="order-4 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <p className="text-sm font-medium @min-[44rem]:hidden">Total del ítem</p>
            <output
              htmlFor={`${id}-cantidad ${id}-precio`}
              aria-label={`Total del ítem ${number}`}
              className={cn(
                'flex min-h-11 items-center justify-end rounded-lg bg-muted/60 px-2 text-right text-sm font-semibold tabular-nums @min-[44rem]:min-h-10 @min-[44rem]:bg-transparent @min-[44rem]:px-0',
                ITEM_NUMBER_CLASS,
              )}
            >
              {total === null ? '—' : formatAmountTable(total)}
            </output>
          </div>
        ) : null}
      </div>

      {messages.length ? (
        <p
          id={`${id}-error`}
          className="col-span-2 text-sm text-destructive @min-[44rem]:col-span-full @min-[44rem]:col-start-2"
        >
          {messages.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}
