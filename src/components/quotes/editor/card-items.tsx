'use client'

import { Card } from '@/components/form/card'
import { useSheetForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatAmountTable } from '@/lib/format/amounts'
import type { Despachar } from '@/lib/quotes/editor-screen'
import type { ItemEditor } from '@/lib/quotes/editor/types'
import {
  destinationFoco,
  nameSectionNew,
  rowsGrid,
  totalGeneral,
  vecinoOnQuitar,
  type ErrorsItem,
  type PedidoFoco,
} from '@/lib/quotes/grid'
import { type Format } from '@/lib/templates/content'
import { cn } from '@/lib/utils'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { RowItem } from './item-row'
import { HeaderSection } from './item-section-header'
import {
  ITEM_COLUMNS,
  TEMPLATE_ITEM_COLUMNS,
  DRAG_SCREEN_READER_INSTRUCTIONS,
  DRAG_KEYBOARD_CODES,
  type OnChangeDraftSection,
} from './items-grid.constants'
export type { OnChangeDraftSection } from './items-grid.constants'

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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: DRAG_KEYBOARD_CODES }),
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
    <Card
      compacta
      titulo="Ítems"
      descripcion={
        editPrices
          ? 'Definí los conceptos, cantidades y precios del servicio.'
          : 'Los precios se completan en cada cotización.'
      }
    >
      <div className={cn('overflow-hidden rounded-lg border', !inSheet && '-mx-1')}>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[15px] text-muted-foreground">Todavía no hay ítems.</p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                'hidden h-11 items-center gap-x-2 border-b bg-muted/30 px-3 text-xs font-medium text-muted-foreground @min-[44rem]:grid',
                editPrices ? ITEM_COLUMNS : TEMPLATE_ITEM_COLUMNS,
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
              accessibility={{ announcements: anuncios, screenReaderInstructions: DRAG_SCREEN_READER_INSTRUCTIONS }}
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
            <Button
              ref={buttonAgregar}
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-primary @min-[44rem]:h-9"
              onClick={agregarOnFinal}
            >
              <Plus aria-hidden />
              Agregar ítem
            </Button>
            {/* Las secciones solo se imprimen en el formato por jornada. */}
            {formato === 'jornada' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 text-primary @min-[44rem]:h-9"
                onClick={agregarSection}
              >
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
