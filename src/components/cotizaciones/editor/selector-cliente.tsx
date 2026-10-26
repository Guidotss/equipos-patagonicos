'use client'
// src/components/cotizaciones/editor/selector-cliente.tsx

import { ChevronsUpDown, Plus } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { buscarClientes, crearClienteRapido } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Pastilla } from '@/components/ui/pastilla'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { mismoNombre } from '@/lib/cotizaciones/editor-pantalla'
import { formatCuit } from '@/lib/cuit'
import { cn } from '@/lib/utils'

export type ClienteBuscado = { id: string; razon_social: string; cuit: string | null; activo: boolean }

const DEMORA_BUSQUEDA = 250

/**
 * Combobox de cliente (decisión 18): busca con buscar_clientes (sin acentos, por CUIT y por contacto), muestra los
 * inactivos al final con su marca y ofrece "+ Crear cliente «texto»" con solo la razón social.
 */
export function SelectorCliente({
  id,
  cliente,
  error,
  alElegir,
}: {
  id: string
  cliente: { id: string; razon_social: string } | null
  error?: string
  alElegir: (cliente: ClienteBuscado) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ClienteBuscado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoPedido = useRef(0)

  function buscar(valor: string, demora: number) {
    if (temporizador.current) clearTimeout(temporizador.current)
    const pedido = ++ultimoPedido.current
    setBuscando(true)
    temporizador.current = setTimeout(async () => {
      try {
        const resultado = await buscarClientes(valor)
        if (pedido !== ultimoPedido.current) return
        if (resultado.ok) setResultados(resultado.datos)
        else {
          setResultados([])
          toast.error(resultado.mensaje)
        }
      } catch (error) {
        unstable_rethrow(error)
        if (pedido === ultimoPedido.current) toast.error('No se pudo buscar. Probá de nuevo en un momento.')
      } finally {
        if (pedido === ultimoPedido.current) setBuscando(false)
      }
    }, demora)
  }

  function alAbrir(siguiente: boolean) {
    setAbierto(siguiente)
    if (siguiente) {
      setTexto('')
      buscar('', 0)
    }
  }

  function alEscribir(valor: string) {
    setTexto(valor)
    buscar(valor, DEMORA_BUSQUEDA)
  }

  function elegir(elegido: ClienteBuscado) {
    setAbierto(false)
    alElegir(elegido)
  }

  const razonSocial = texto.trim()

  async function crear() {
    if (!razonSocial || creando) return
    setCreando(true)
    try {
      const resultado = await crearClienteRapido(razonSocial)
      if (!resultado.ok) {
        toast.error(resultado.mensaje)
        return
      }
      toast.success('Cliente creado. El CUIT y los demás datos se completan en Clientes.')
      elegir({ ...resultado.datos, activo: true })
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudo crear el cliente. Probá de nuevo en un momento.')
    } finally {
      setCreando(false)
    }
  }

  // Mientras corre la búsqueda, `resultados` es la de antes: ofrecer crear ahí deja crear un duplicado de un cliente
  // que ya existe (solo el CUIT es único en la tabla).
  const ofrecerCrear =
    !buscando && razonSocial !== '' && !resultados.some((otro) => mismoNombre(otro.razon_social, razonSocial))

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-8 w-full justify-between px-2.5 font-normal"
        >
          <span className={cn('truncate', !cliente && 'text-muted-foreground')}>
            {cliente?.razon_social ?? 'Buscá o creá un cliente'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false} label="Buscar cliente">
          <CommandInput value={texto} onValueChange={alEscribir} placeholder="Razón social, CUIT o contacto" />
          <CommandList>
            {buscando && resultados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
            ) : null}
            {buscando ? null : (
              <CommandEmpty>{texto ? 'No hay clientes que coincidan.' : 'Todavía no hay clientes cargados.'}</CommandEmpty>
            )}
            {resultados.length > 0 ? (
              <CommandGroup>
                {resultados.map((opcion) => (
                  <CommandItem
                    key={opcion.id}
                    value={opcion.id}
                    onSelect={() => elegir(opcion)}
                    className={cn(!opcion.activo && 'text-muted-foreground')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opcion.razon_social}</span>
                      {opcion.cuit ? (
                        <span className="block text-xs text-muted-foreground tabular-nums">{formatCuit(opcion.cuit)}</span>
                      ) : null}
                    </span>
                    {opcion.activo ? null : <Pastilla>Inactivo</Pastilla>}
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
