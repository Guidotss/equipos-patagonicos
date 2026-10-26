'use client'

import { CalendarDays, Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react'
import { ESTADOS_COTIZACION } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ESTADOS_FILTRO, hrefConFiltros, leerFiltros, type FiltrosLista } from '@/lib/cotizaciones/lista'
import { atajosFechas, textoRangoFechas, type AtajoFechas } from '@/lib/cotizaciones/lista-vista'
import { hoyArgentina } from '@/lib/format/fechas'
import { cn } from '@/lib/utils'

type ClienteFiltro = { id: string; razon_social: string }
type Rango = { desde: string; hasta: string }
type FiltrosHoja = Pick<FiltrosLista, 'estado' | 'cliente' | 'desde' | 'hasta'>

const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'

function aEstado(valor: string): FiltrosLista['estado'] {
  return ESTADOS_FILTRO.find((estado) => estado === valor) ?? ''
}

function rangoInvalido({ desde, hasta }: Rango) {
  return desde !== '' && hasta !== '' && desde > hasta
}

function AvisoRango() {
  return <p className="text-sm text-destructive">“Hasta” es anterior a “Desde”.</p>
}

function OpcionesEstado() {
  return (
    <>
      <NativeSelectOption value="">Todos los estados</NativeSelectOption>
      {ESTADOS_FILTRO.map((estado) => (
        <NativeSelectOption key={estado} value={estado}>
          {ESTADOS_COTIZACION[estado].etiqueta}
        </NativeSelectOption>
      ))}
    </>
  )
}

function OpcionesCliente({ clientes }: { clientes: ClienteFiltro[] }) {
  return (
    <>
      <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
      {clientes.map((cliente) => (
        <NativeSelectOption key={cliente.id} value={cliente.id}>
          {cliente.razon_social}
        </NativeSelectOption>
      ))}
    </>
  )
}

/** Desde y Hasta como date nativos (sin calendario: no suma dependencias). */
function CamposRango({ rango, alCambiar, alto }: { rango: Rango; alCambiar: (rango: Rango) => void; alto: string }) {
  const idDesde = useId()
  const idHasta = useId()
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={idDesde} className={ETIQUETA}>
          Desde
        </Label>
        <Input
          id={idDesde}
          type="date"
          value={rango.desde}
          max={rango.hasta || undefined}
          onChange={(evento) => alCambiar({ ...rango, desde: evento.target.value })}
          className={alto}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={idHasta} className={ETIQUETA}>
          Hasta
        </Label>
        <Input
          id={idHasta}
          type="date"
          value={rango.hasta}
          min={rango.desde || undefined}
          onChange={(evento) => alCambiar({ ...rango, hasta: evento.target.value })}
          className={alto}
        />
      </div>
    </div>
  )
}

/** Botón con el rango que abre un popover con Desde, Hasta y atajos. Sin rango por defecto (decisión 23). */
function SelectorFechas({
  desde,
  hasta,
  alAplicar,
  className,
}: {
  desde: string
  hasta: string
  alAplicar: (rango: Rango) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [rango, setRango] = useState<Rango>({ desde, hasta })
  const [atajos, setAtajos] = useState<AtajoFechas[]>([])
  const texto = textoRangoFechas(desde, hasta)

  function alAbrir(abrir: boolean) {
    if (abrir) {
      setRango({ desde, hasta })
      // Se calculan al abrir y no al dibujar: "hoy" no puede cambiar entre el servidor y el navegador.
      setAtajos(atajosFechas(hoyArgentina()))
    }
    setAbierto(abrir)
  }

  function aplicar(nuevo: Rango) {
    setAbierto(false)
    alAplicar(nuevo)
  }

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Fechas: ${texto}`}
          className={cn('h-9 w-full justify-between bg-background px-3 font-normal', className)}
        >
          <span className={cn('truncate tabular-nums', !desde && !hasta && 'text-muted-foreground')}>{texto}</span>
          <CalendarDays className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Rango de fechas" className="w-80 gap-3 p-3">
        <CamposRango rango={rango} alCambiar={setRango} alto="h-9" />
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((atajo) => (
            <Button
              key={atajo.etiqueta}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => aplicar({ desde: atajo.desde, hasta: atajo.hasta })}
            >
              {atajo.etiqueta}
            </Button>
          ))}
        </div>
        {rangoInvalido(rango) ? <AvisoRango /> : null}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => aplicar({ desde: '', hasta: '' })}>
            Limpiar
          </Button>
          <Button type="button" size="sm" disabled={rangoInvalido(rango)} onClick={() => aplicar(rango)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** En pantallas angostas: un botón "Filtros" que abre una hoja desde abajo con estado, cliente y fechas. */
function FiltrosMovil({
  filtros,
  clientes,
  activos,
  alAplicar,
}: {
  filtros: FiltrosLista
  clientes: ClienteFiltro[]
  activos: number
  alAplicar: (cambios: FiltrosHoja) => void
}) {
  const idEstado = useId()
  const idCliente = useId()
  const [abierto, setAbierto] = useState(false)
  const [hoja, setHoja] = useState<FiltrosHoja>({
    estado: filtros.estado,
    cliente: filtros.cliente,
    desde: filtros.desde,
    hasta: filtros.hasta,
  })

  function alAbrir(abrir: boolean) {
    if (abrir) setHoja({ estado: filtros.estado, cliente: filtros.cliente, desde: filtros.desde, hasta: filtros.hasta })
    setAbierto(abrir)
  }

  function aplicar(cambios: FiltrosHoja) {
    setAbierto(false)
    alAplicar(cambios)
  }

  return (
    <Sheet open={abierto} onOpenChange={alAbrir}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-10 gap-1.5 px-3 text-[15px] @min-[40rem]:hidden">
          <SlidersHorizontal aria-hidden />
          Filtros
          {activos > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {activos}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Estado, cliente y fechas de la cotización.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="space-y-1">
            <Label htmlFor={idEstado} className={ETIQUETA}>
              Estado
            </Label>
            <NativeSelect
              id={idEstado}
              value={hoja.estado}
              onChange={(evento) => setHoja({ ...hoja, estado: aEstado(evento.target.value) })}
              className="w-full [&>select]:h-10"
            >
              <OpcionesEstado />
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={idCliente} className={ETIQUETA}>
              Cliente
            </Label>
            <NativeSelect
              id={idCliente}
              value={hoja.cliente}
              onChange={(evento) => setHoja({ ...hoja, cliente: evento.target.value })}
              className="w-full [&>select]:h-10"
            >
              <OpcionesCliente clientes={clientes} />
            </NativeSelect>
          </div>
          <CamposRango rango={hoja} alCambiar={(rango) => setHoja({ ...hoja, ...rango })} alto="h-10" />
          {rangoInvalido(hoja) ? <AvisoRango /> : null}
        </div>
        <SheetFooter className="flex-row border-t">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            onClick={() => aplicar({ estado: '', cliente: '', desde: '', hasta: '' })}
          >
            Limpiar
          </Button>
          <Button type="button" className="h-10 flex-1" disabled={rangoInvalido(hoja)} onClick={() => aplicar(hoja)}>
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Buscador y filtros de la lista. Todo vive en la URL (hrefConFiltros): los selects y las fechas navegan solos y el
 * buscador con Enter. Mientras navega marca data-pendiente, que la tarjeta de resultados usa para atenuarse.
 *
 * Ningún control se vuelve a montar al cambiar la URL (un key le sacaba el foco al que se estaba usando): los selects
 * son controlados y el buscador se actualiza a mano cuando no se tipeó nada distinto de lo que mostraba.
 */
export function FiltrosCotizaciones({ filtros, clientes }: { filtros: FiltrosLista; clientes: ClienteFiltro[] }) {
  const router = useRouter()
  const [pendiente, iniciarNavegacion] = useTransition()
  // Los de la URL, o los recién elegidos mientras se navega hacia ellos. Sin navegación pendiente son `filtros`, así
  // que los selects siguen a la URL cuando cambia desde afuera (chips, "Limpiar filtros", atrás del navegador).
  const [vigentes, adelantar] = useOptimistic(
    filtros,
    (actuales: FiltrosLista, cambios: Partial<FiltrosLista>): FiltrosLista => ({ ...actuales, ...cambios }),
  )
  const buscador = useRef<HTMLInputElement>(null)
  // La última búsqueda de la URL que se reflejó en el buscador.
  const qReflejada = useRef(filtros.q)

  // Si la búsqueda cambia desde afuera ("Limpiar filtros", atrás o adelante del navegador), el buscador vuelve a leer
  // la URL aunque tenga el foco, salvo que se haya tipeado algo distinto de lo que mostraba: eso no se pisa. Se decide
  // por el contenido y no por el foco porque después de buscar con Enter el foco se queda en el buscador.
  useEffect(() => {
    const campo = buscador.current
    // El texto se normaliza como el de la URL (espacios, largo máximo) para compararlo con la búsqueda que mostraba.
    if (campo && leerFiltros({ q: campo.value }).q === qReflejada.current) campo.value = filtros.q
    qReflejada.current = filtros.q
  }, [filtros.q])

  function aplicar(cambios: Partial<FiltrosLista>) {
    iniciarNavegacion(() => {
      adelantar(cambios)
      // Sobre `vigentes`: dos cambios seguidos no se pisan aunque el primero todavía no haya llegado a la URL.
      router.push(hrefConFiltros(vigentes, cambios), { scroll: false })
    })
  }

  // Los filtros aplicados (menos el texto) como chips para quitarlos de a uno en el celular.
  const chips: { clave: string; texto: string; quitar: Partial<FiltrosLista> }[] = []
  if (filtros.estado) {
    chips.push({ clave: 'estado', texto: ESTADOS_COTIZACION[filtros.estado].etiqueta, quitar: { estado: '' } })
  }
  if (filtros.cliente) {
    const cliente = clientes.find((c) => c.id === filtros.cliente)
    chips.push({ clave: 'cliente', texto: cliente?.razon_social ?? 'Cliente', quitar: { cliente: '' } })
  }
  if (filtros.desde || filtros.hasta) {
    const texto = textoRangoFechas(filtros.desde, filtros.hasta)
    chips.push({ clave: 'fechas', texto, quitar: { desde: '', hasta: '' } })
  }

  return (
    <div data-pendiente={pendiente ? '' : undefined} className="@container space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @min-[40rem]:grid-cols-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_10rem_11.5rem_13.5rem]">
        <form
          role="search"
          className="relative @min-[40rem]:col-span-3 @min-[48rem]:col-span-1"
          onSubmit={(evento) => {
            evento.preventDefault()
            const q = new FormData(evento.currentTarget).get('q')
            aplicar({ q: typeof q === 'string' ? q.trim() : '' })
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={buscador}
            name="q"
            type="search"
            defaultValue={filtros.q}
            placeholder="Buscar por N°, cliente o asunto"
            aria-label="Buscar cotizaciones"
            className="h-10 bg-background pl-9 @min-[40rem]:h-9"
          />
          <button type="submit" className="sr-only">
            Buscar
          </button>
        </form>

        <FiltrosMovil filtros={filtros} clientes={clientes} activos={chips.length} alAplicar={aplicar} />

        {/* pr-7 y no el pr-8 del select: con 160 px, "Todos los estados" se cortaba antes de la flecha. */}
        <NativeSelect
          aria-label="Estado"
          value={vigentes.estado}
          onChange={(evento) => aplicar({ estado: aEstado(evento.target.value) })}
          className="hidden w-full @min-[40rem]:block [&>select]:h-9 [&>select]:bg-background [&>select]:pr-7"
        >
          <OpcionesEstado />
        </NativeSelect>
        <NativeSelect
          aria-label="Cliente"
          value={vigentes.cliente}
          onChange={(evento) => aplicar({ cliente: evento.target.value })}
          className="hidden w-full @min-[40rem]:block [&>select]:h-9 [&>select]:bg-background [&>select]:pr-7"
        >
          <OpcionesCliente clientes={clientes} />
        </NativeSelect>
        <SelectorFechas
          desde={filtros.desde}
          hasta={filtros.hasta}
          alAplicar={aplicar}
          className="hidden @min-[40rem]:flex"
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 @min-[40rem]:hidden">
          {chips.map((chip) => (
            <button
              key={chip.clave}
              type="button"
              aria-label={`Quitar filtro ${chip.texto}`}
              onClick={() => aplicar(chip.quitar)}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-accent px-2 text-[13px] text-primary"
            >
              <span className="truncate">{chip.texto}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
