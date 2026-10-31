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
import { Tarjeta } from '@/components/formulario/tarjeta'
import { useHojaFormulario } from '@/components/formulario/estructura-formulario'
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
import type { ItemEditor } from '@/lib/cotizaciones/editor'
import type { Despachar } from '@/lib/cotizaciones/editor-pantalla'
import {
  destinoFoco,
  filasGrilla,
  nombreSeccionNueva,
  normalizarPrecio,
  totalGeneral,
  totalLinea,
  vecinoAlQuitar,
  type CampoGrilla,
  type ErroresItem,
  type FilaSeccion,
  type PedidoFoco,
} from '@/lib/cotizaciones/grilla'
import { formatMontoTabla, parsePrecio } from '@/lib/format/montos'
import { UNIDADES, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { cn } from '@/lib/utils'

/** Una línea desde 44rem de ancho propio; Precio y Total admiten "39.000.000,00" sin recortar. */
const COLUMNAS = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_8rem_6rem_7rem]'
const COLUMNAS_PLANTILLA = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_6rem]'

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
export type AlCambiarBorradorSeccion = (clave: string, aplicar: (() => void) | null) => void

/**
 * Encabezado editable de una sección. El nombre se aplica al salir del campo o con Enter, no en cada tecla:
 * renombrarSeccion junta el grupo con el vecino si quedan con el mismo nombre, y a mitad de escribir
 * ("Precios Jornada Adicional" → "Precios Jornada") el encabezado desaparecería con el foco adentro.
 * Mientras tanto el borrador cuenta como cambio sin guardar: se registra arriba con su `aplicar`, que habilita Guardar
 * y que guardar (el botón o Ctrl/⌘+S) llama antes de leer el estado. Así no depende de que el blur del clic llegue antes
 * que el click (no está verificado en Safari ni en iOS).
 */
function EncabezadoSeccion({
  fila,
  error,
  despachar,
  alCambiarBorrador,
}: {
  fila: FilaSeccion
  error?: string
  despachar: Despachar
  alCambiarBorrador: AlCambiarBorradorSeccion
}) {
  const id = `seccion-${fila.clave}`
  const [borrador, setBorrador] = useState<string | null>(null)
  const pendiente = borrador !== null && borrador !== fila.seccion

  function aplicar() {
    if (borrador !== null && borrador !== fila.seccion) {
      despachar({ tipo: 'renombrarSeccion', clave: fila.clave, seccion: borrador })
    }
    setBorrador(null)
  }

  // El registro del editor llama al aplicar del último render: el que tiene el borrador que se ve.
  const aplicarActual = useRef(aplicar)
  useLayoutEffect(() => {
    aplicarActual.current = aplicar
  })

  // También al desmontarse con el borrador a medio escribir (la limpieza lo retira).
  useEffect(() => {
    if (!pendiente) return
    alCambiarBorrador(fila.clave, () => aplicarActual.current())
    return () => alCambiarBorrador(fila.clave, null)
  }, [pendiente, fila.clave, alCambiarBorrador])

  return (
    <div className="border-b bg-muted/60 p-3 @min-[44rem]:pl-12">
      <Input
        id={id}
        aria-label={`Nombre de la sección ${fila.numero}`}
        value={borrador ?? fila.seccion}
        maxLength={100}
        // Una sección sin nombre sale como "Precios:" en el PDF por jornada.
        placeholder="Precios"
        onChange={(evento) => setBorrador(evento.target.value)}
        onBlur={aplicar}
        onKeyDown={(evento) => {
          // Ctrl/⌘+S lo maneja el editor: guardar aplica antes los borradores registrados.
          if (evento.nativeEvent.isComposing || evento.key !== 'Enter') return
          evento.preventDefault()
          aplicar()
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

type CampoItem = Exclude<CampoGrilla, 'seccion'>

function FilaItem({
  item,
  indice,
  cantidadItems,
  errores,
  despachar,
  alEnter,
  alMover,
  alDuplicar,
  alQuitar,
  editarPrecios,
}: {
  item: ItemEditor
  indice: number
  cantidadItems: number
  /** Los errores de guardado de esta fila (por clave, no por posición: ver TarjetaItems). */
  errores: ErroresItem
  despachar: Despachar
  alEnter: () => void
  alMover: (paso: -1 | 1) => void
  alDuplicar: () => void
  alQuitar: () => void
  editarPrecios: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.clave,
    attributes: { roleDescription: 'ítem ordenable' },
  })
  const [menuAbierto, setMenuAbierto] = useState(false)
  // Mientras se escribe el precio se ve tal cual; fuera del campo, con formato ("1.950.000,00"), venga de donde venga
  // (lo cargado de la base llega como "1.950.000", textoPrecio de la Task 3). Se pasa a "escribiendo" con la primera
  // tecla y no al enfocar: si el texto cambiara al entrar con Tab, React reasignaría el valor, se perdería la
  // selección del navegador y lo tipeado se agregaría al precio en vez de reemplazarlo.
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  // Un clic sin mover abre el menú; el clic que llega al soltar después de arrastrar con el puntero, no. Arrastrar con
  // el teclado (Espacio) no termina en un clic: no marca nada, y el próximo clic (el de un lector de pantalla) abre.
  const huboArrastre = useRef(false)
  const conPuntero = useRef(false)
  // El menú estaba abierto al apoyar en el agarre: Radix lo cierra (es un clic afuera del menú) y el clic no lo reabre.
  const menuAbiertoAlApoyar = useRef(false)
  // Duplicar y Eliminar llevan el foco a otra fila: el menú no lo devuelve al agarre al cerrarse.
  const mantenerFoco = useRef(false)
  useEffect(() => {
    if (isDragging && conPuntero.current) huboArrastre.current = true
  }, [isDragging])

  const numero = indice + 1
  const id = `item-${item.clave}`
  const error = (campo: CampoItem) => errores[campo]
  const mensajes = (['descripcion', 'cantidad', 'precio', 'unidad'] as const).map(error).filter(Boolean)
  const describir = (campo: CampoItem) => (error(campo) ? `${id}-error` : undefined)
  const precioMalEscrito = item.precio.trim() !== '' && parsePrecio(item.precio) === null
  const total = totalLinea(item)
  const cambiar = (cambios: Partial<Omit<ItemEditor, 'clave'>>) => despachar({ tipo: 'item', clave: item.clave, cambios })

  // Enter (sin Shift, que deja escribir un salto en la descripción) agrega una fila debajo y la enfoca.
  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key !== 'Enter' || evento.shiftKey || evento.nativeEvent.isComposing) return
    evento.preventDefault()
    alEnter()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative mx-3 my-3 grid grid-cols-2 items-start gap-x-3 gap-y-3 rounded-lg border bg-card px-3 pb-4 @min-[44rem]:m-0 @min-[44rem]:gap-x-2 @min-[44rem]:gap-y-2 @min-[44rem]:rounded-none @min-[44rem]:border-0 @min-[44rem]:border-b @min-[44rem]:py-3',
        editarPrecios ? COLUMNAS : COLUMNAS_PLANTILLA,
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <DropdownMenu open={menuAbierto} onOpenChange={setMenuAbierto} modal={false}>
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
              conPuntero.current = true
              menuAbiertoAlApoyar.current = menuAbierto
              // El preventDefault de abajo no deja que el foco se mueva solo: se pasa acá al agarre para que un nombre
              // de sección a medio escribir se aplique (con su blur) antes de que el arrastre cambie el primer ítem
              // del grupo y el encabezado, con su borrador, se vuelva a montar.
              evento.currentTarget.focus()
              listeners?.onPointerDown?.(evento)
              // Sin esto Radix abriría el menú al apoyar, antes de saber si es un arrastre.
              evento.preventDefault()
            }}
            onKeyDown={(evento) => {
              if (!isDragging) conPuntero.current = false
              listeners?.onKeyDown?.(evento)
              // Mientras se arrastra con el teclado, las flechas y Espacio son del arrastre, no del menú.
              if (isDragging) evento.preventDefault()
            }}
            onClick={() => {
              // Solo se ignoran el clic que sigue a un arrastre y el que cerró el menú abierto (si no, se cerraría y
              // se volvería a abrir). Los de detail 0 abren: así activa un lector de pantalla en modo exploración. El
              // teclado no duplica: Enter abre en el keydown (Radix) y lo previene, así que no genera clic, y el
              // keydown de Espacio lo previene el arrastre.
              const ignorar = huboArrastre.current || menuAbiertoAlApoyar.current
              huboArrastre.current = false
              menuAbiertoAlApoyar.current = false
              if (!ignorar) setMenuAbierto(true)
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
          <DropdownMenuItem disabled={indice === 0} onSelect={() => alMover(-1)}>
            <ArrowUp aria-hidden />
            Subir
          </DropdownMenuItem>
          <DropdownMenuItem disabled={indice === cantidadItems - 1} onSelect={() => alMover(1)}>
            <ArrowDown aria-hidden />
            Bajar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              mantenerFoco.current = true
              alDuplicar()
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
              alQuitar()
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
          onChange={(evento) => cambiar({ descripcion: evento.target.value })}
          onKeyDown={alTeclear}
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
            onChange={(evento) => cambiar({ cantidad: evento.target.value })}
            onKeyDown={alTeclear}
            aria-invalid={Boolean(error('cantidad'))}
            aria-describedby={describir('cantidad')}
            className={cn(CAMPO, 'px-2 tabular-nums', CIFRA)}
          />
        </div>
        {editarPrecios ? (
          <div className="order-3 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <Label htmlFor={`${id}-precio`} className="@min-[44rem]:hidden">Precio unitario</Label>
            <Input
              id={`${id}-precio`}
              aria-label={`Precio del ítem ${numero}`}
              inputMode="decimal"
              value={editandoPrecio ? item.precio : normalizarPrecio(item.precio)}
              placeholder="Sin precio"
              onChange={(evento) => {
                setEditandoPrecio(true)
                cambiar({ precio: evento.target.value })
              }}
              onBlur={() => {
                setEditandoPrecio(false)
                const normal = normalizarPrecio(item.precio)
                if (normal !== item.precio) cambiar({ precio: normal })
              }}
              onKeyDown={alTeclear}
              aria-invalid={Boolean(error('precio')) || precioMalEscrito}
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
            onChange={(evento) => cambiar({ unidad: evento.target.value as Unidad })}
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
        {editarPrecios ? (
          <div className="order-4 min-w-0 space-y-1.5 @min-[44rem]:order-none @min-[44rem]:space-y-0">
            <p className="text-sm font-medium @min-[44rem]:hidden">Total del ítem</p>
            <output
              htmlFor={`${id}-cantidad ${id}-precio`}
              aria-label={`Total del ítem ${numero}`}
              className={cn('flex min-h-11 items-center justify-end rounded-lg bg-muted/60 px-2 text-right text-sm font-semibold tabular-nums @min-[44rem]:min-h-10 @min-[44rem]:bg-transparent @min-[44rem]:px-0', CIFRA)}
            >
              {total === null ? '—' : formatMontoTabla(total)}
            </output>
          </div>
        ) : null}
      </div>

      {mensajes.length ? (
        <p id={`${id}-error`} className="col-span-2 text-sm text-destructive @min-[44rem]:col-span-full @min-[44rem]:col-start-2">
          {mensajes.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

export function TarjetaItems({
  items,
  formato,
  mostrarTotal,
  errores,
  despachar,
  alCambiarBorradorSeccion,
  editarPrecios = true,
}: {
  items: ItemEditor[]
  formato: Formato
  mostrarTotal: boolean
  /**
   * Errores de guardado por clave de ítem. EditorCotizacion los pasa de 'items.N.campo' a claves al guardar, con las
   * claves de los ítems que mandó: la marca queda en el ítem que la tuvo aunque mientras se guardaba o después se
   * agreguen, dupliquen, muevan o borren otros.
   */
  errores: Record<string, ErroresItem>
  despachar: Despachar
  /** Un nombre de sección escrito y todavía no aplicado: el editor lo cuenta como cambio sin guardar. */
  alCambiarBorradorSeccion: AlCambiarBorradorSeccion
  /** Las plantillas guardan descripciones, cantidades y unidades; los precios se definen al cotizar. */
  editarPrecios?: boolean
}) {
  const idDnd = useId()
  const enHoja = useHojaFormulario()
  const foco = useRef<PedidoFoco | 'agregar' | null>(null)
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const sensores = useSensors(
    // 4 px de movimiento antes de arrastrar: un clic en el agarre abre el menú.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: TECLAS }),
  )
  const filas = filasGrilla(items)
  const { total, sinPrecio } = totalGeneral(items)

  // Después de agregar, duplicar o borrar, el foco va a la fila que corresponde (las claves las pone el reducer).
  useEffect(() => {
    const pedido = foco.current
    if (!pedido) return
    foco.current = null
    if (pedido === 'agregar') {
      botonAgregar.current?.focus()
      return
    }
    const destino = destinoFoco(pedido, items)
    if (!destino) return
    const elemento = document.getElementById(
      destino.campo === 'seccion' ? `seccion-${destino.clave}` : `item-${destino.clave}-descripcion`,
    )
    elemento?.focus()
    if (destino.campo === 'seccion' && elemento instanceof HTMLInputElement) elemento.select()
  }, [items])

  // Si el ítem cae en el medio de otro grupo, el reducer le pone esa sección (Task 3).
  function mover(desde: number, hasta: number) {
    if (desde === hasta || hasta < 0 || hasta >= items.length) return
    despachar({ tipo: 'moverItem', desde, hasta })
  }

  function agregarDespuesDe(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'agregarItem', despuesDe: item.clave, seccion: item.seccion })
  }

  function agregarAlFinal() {
    foco.current = { tipo: 'ultimo' }
    despachar({ tipo: 'agregarItem', seccion: items.at(-1)?.seccion ?? '' })
  }

  function agregarSeccion() {
    foco.current = { tipo: 'seccionUltima' }
    despachar({ tipo: 'agregarSeccion', nombre: nombreSeccionNueva(items) })
  }

  function duplicar(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'duplicarItem', clave: item.clave })
  }

  function quitar(item: ItemEditor) {
    const vecino = vecinoAlQuitar(items, item.clave)
    foco.current = vecino ? { tipo: 'item', clave: vecino } : 'agregar'
    despachar({ tipo: 'quitarItem', clave: item.clave })
  }

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    mover(
      items.findIndex((item) => item.clave === active.id),
      items.findIndex((item) => item.clave === over.id),
    )
  }

  const posicion = (id: UniqueIdentifier) => items.findIndex((item) => item.clave === id) + 1
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste el ítem ${posicion(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `El ítem ${posicion(active.id)} pasa a la posición ${posicion(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste el ítem ${posicion(active.id)} en la posición ${posicion(over.id)}.`
        : `Soltaste el ítem ${posicion(active.id)}.`,
    onDragCancel: ({ active }) => `Se canceló el movimiento del ítem ${posicion(active.id)}.`,
  }

  return (
    <Tarjeta compacta titulo="Ítems" descripcion={editarPrecios ? 'Definí los conceptos, cantidades y precios del servicio.' : 'Los precios se completan en cada cotización.'}>
      <div className={cn('overflow-hidden rounded-lg border', !enHoja && '-mx-1')}>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[15px] text-muted-foreground">Todavía no hay ítems.</p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                'hidden h-11 items-center gap-x-2 border-b bg-muted/30 px-3 text-xs font-medium text-muted-foreground @min-[44rem]:grid',
                editarPrecios ? COLUMNAS : COLUMNAS_PLANTILLA,
              )}
            >
              <span />
              <span className="pl-2.5">Descripción</span>
              <span className="pl-1">Cantidad</span>
              {editarPrecios ? <span className="pr-2 text-right">Precio unitario</span> : null}
              <span className="pl-2">Unidad</span>
              {editarPrecios ? <span className="text-right">Total</span> : null}
            </div>
            <DndContext
              id={idDnd}
              sensors={sensores}
              collisionDetection={closestCenter}
              onDragEnd={alSoltar}
              accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCCIONES }}
            >
              <SortableContext items={items.map((item) => item.clave)} strategy={verticalListSortingStrategy}>
                {filas.map((fila) =>
                  fila.tipo === 'seccion' ? (
                    <EncabezadoSeccion
                      key={`seccion-${fila.clave}`}
                      fila={fila}
                      error={errores[fila.clave]?.seccion}
                      despachar={despachar}
                      alCambiarBorrador={alCambiarBorradorSeccion}
                    />
                  ) : (
                    <FilaItem
                      key={items[fila.indice].clave}
                      item={items[fila.indice]}
                      indice={fila.indice}
                      cantidadItems={items.length}
                      errores={errores[items[fila.indice].clave] ?? {}}
                      despachar={despachar}
                      alEnter={() => agregarDespuesDe(items[fila.indice])}
                      alMover={(paso) => mover(fila.indice, fila.indice + paso)}
                      alDuplicar={() => duplicar(items[fila.indice])}
                      alQuitar={() => quitar(items[fila.indice])}
                      editarPrecios={editarPrecios}
                    />
                  ),
                )}
              </SortableContext>
            </DndContext>
            {editarPrecios && mostrarTotal ? (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t bg-muted/30 px-3 py-3 text-sm @min-[44rem]:justify-end @min-[44rem]:border-t-0 @min-[44rem]:border-b">
                <span className="font-medium">Total</span>
                {total === null ? (
                  <span className="text-muted-foreground">
                    {sinPrecio > 0
                      ? `Falta el precio de ${sinPrecio === 1 ? '1 ítem' : `${sinPrecio} ítems`}`
                      : 'Revisá las cantidades'}
                  </span>
                ) : (
                  <span className="min-w-24 text-right font-medium tabular-nums">{formatMontoTabla(total)}</span>
                )}
              </div>
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-2 border-t px-3 py-3 @min-[44rem]:flex-row @min-[44rem]:items-center @min-[44rem]:justify-between @min-[44rem]:border-t-0">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <Button ref={botonAgregar} type="button" variant="ghost" size="sm" className="h-11 text-primary @min-[44rem]:h-9" onClick={agregarAlFinal}>
              <Plus aria-hidden />
              Agregar ítem
            </Button>
            {/* Las secciones solo se imprimen en el formato por jornada. */}
            {formato === 'jornada' ? (
              <Button type="button" variant="ghost" size="sm" className="h-11 text-primary @min-[44rem]:h-9" onClick={agregarSeccion}>
                <Plus aria-hidden />
                Agregar sección
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-11 shrink-0 items-center gap-2 @min-[44rem]:min-h-9">
            <Switch
              id="cotizacion-mostrar-total"
              checked={mostrarTotal}
              onCheckedChange={(valor) => despachar({ tipo: 'mostrarTotal', valor })}
            />
            <Label htmlFor="cotizacion-mostrar-total" className="text-sm font-normal">
              Total en el PDF
            </Label>
          </div>
        </div>
      </div>
    </Tarjeta>
  )
}
