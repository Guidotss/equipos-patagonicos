'use client'
// src/components/cotizaciones/editor/selector-cliente.tsx

import { ChevronsUpDown, Plus } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { searchClients, crearClientRapido } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Pill } from '@/components/ui/pill'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { mismoName } from '@/lib/quotes/editor-screen'
import { formatCuit } from '@/lib/cuit'
import { cn } from '@/lib/utils'

export type ClientBuscado = { id: string; razon_social: string; cuit: string | null; activo: boolean }

const DEMORA_SEARCH = 250

const MESSAGE_FALLO_SEARCH = 'No se pudo buscar. Probá de nuevo en un momento.'

/** La lista que devolvió la búsqueda de un texto, o la marca de que falló (entonces no hay lista). */
type Search = { texto: string; results: ClientBuscado[]; fallo: boolean }

/**
 * Combobox de cliente (decisión 18): busca con buscar_clientes (sin acentos, por CUIT y por contacto), muestra los
 * inactivos al final con su marca y ofrece "+ Crear cliente «texto»" con solo la razón social.
 */
export function SelectorClient({
  id,
  cliente,
  error,
  onChoose,
}: {
  id: string
  cliente: { id: string; razon_social: string } | null
  error?: string
  onChoose: (cliente: ClientBuscado) => void
}) {
  const [open, setOpen] = useState(false)
  const [texto, setText] = useState('')
  // Cada lista guarda el texto que la pidió: ver `resultados` más abajo.
  const [search, setSearch] = useState<Search | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPedido = useRef(0)

  function findClients(value: string, demora: number) {
    if (temporizador.current) clearTimeout(temporizador.current)
    const pedido = ++lastPedido.current
    setBuscando(true)
    temporizador.current = setTimeout(async () => {
      try {
        const result = await searchClients(value)
        if (pedido !== lastPedido.current) return
        if (result.ok) setSearch({ texto: value, results: result.datos, fallo: false })
        else {
          // Una falla no es "no hay coincidencias": sin la marca se ofrecería crear un cliente que quizás ya existe.
          setSearch({ texto: value, results: [], fallo: true })
          toast.error(result.message)
        }
      } catch (error) {
        unstable_rethrow(error)
        if (pedido === lastPedido.current) {
          setSearch({ texto: value, results: [], fallo: true })
          toast.error(MESSAGE_FALLO_SEARCH)
        }
      } finally {
        if (pedido === lastPedido.current) setBuscando(false)
      }
    }, demora)
  }

  function onAbrir(next: boolean) {
    setOpen(next)
    if (next) {
      setText('')
      findClients('', 0)
    }
  }

  function onEscribir(value: string) {
    setText(value)
    findClients(value, DEMORA_SEARCH)
  }

  function choose(chosen: ClientBuscado) {
    setOpen(false)
    onChoose(chosen)
  }

  const razonSocial = texto.trim()

  async function crear() {
    if (!razonSocial || creando) return
    setCreando(true)
    try {
      const result = await crearClientRapido(razonSocial)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Cliente creado. El CUIT y los demás datos se completan en Clientes.')
      choose({ ...result.datos, activo: true })
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudo crear el cliente. Probá de nuevo en un momento.')
    } finally {
      setCreando(false)
    }
  }

  // Solo se muestra la lista del texto que está escrito. Mientras llega la del texto nuevo, la anterior no se puede
  // elegir: cmdk deja marcado su primer ítem y un Enter rápido lo elegiría (una cotización a nombre de otro cliente).
  const onDay = search !== null && search.texto === texto
  const results = onDay ? search.results : []
  const fallo = onDay && search.fallo

  // Ofrecer crear sin la lista de este texto (todavía no llegó o la búsqueda falló) deja crear un duplicado de un
  // cliente que ya existe (solo el CUIT es único en la tabla).
  const ofrecerCrear =
    !buscando &&
    onDay &&
    !fallo &&
    razonSocial !== '' &&
    !results.some((otro) => mismoName(otro.razon_social, razonSocial))

  return (
    <Popover open={open} onOpenChange={onAbrir}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          // Una razón social que no entra se corta con "…": el title la deja leer entera.
          title={cliente?.razon_social}
          className="h-8 w-full justify-between px-2 font-normal"
        >
          <span className={cn('truncate', !cliente && 'text-muted-foreground')}>
            {cliente?.razon_social ?? 'Buscá o creá un cliente'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false} label="Buscar cliente">
          <CommandInput value={texto} onValueChange={onEscribir} placeholder="Razón social, CUIT o contacto" />
          <CommandList>
            {buscando && results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
            ) : null}
            {buscando ? null : fallo ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{MESSAGE_FALLO_SEARCH}</p>
            ) : (
              <CommandEmpty>{texto ? 'No hay clientes que coincidan.' : 'Todavía no hay clientes cargados.'}</CommandEmpty>
            )}
            {results.length > 0 ? (
              <CommandGroup>
                {results.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => choose(option)}
                    className={cn(!option.activo && 'text-muted-foreground')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.razon_social}</span>
                      {option.cuit ? (
                        <span className="block text-xs text-muted-foreground tabular-nums">{formatCuit(option.cuit)}</span>
                      ) : null}
                    </span>
                    {option.activo ? null : <Pill>Inactivo</Pill>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {ofrecerCrear ? (
              <CommandGroup>
                <CommandItem value="__crear__" onSelect={() => void crear()} disabled={creando} className="text-primary">
                  <Plus aria-hidden />
                  {creando ? 'Creando…' : `Crear cliente «${razonSocial}»`}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
