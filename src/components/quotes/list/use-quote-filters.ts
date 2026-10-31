'use client'

import { STATUSES_QUOTE } from '@/components/quotes/status-quote'
import { hrefWithFilters, readFilters, type FiltersList } from '@/lib/quotes/list'
import { textRangoDates } from '@/lib/quotes/list-view'
import { useRouter } from 'next/navigation'
import { useEffect, useOptimistic, useRef, useTransition } from 'react'

import type { ClientFilter } from './quote-filter-model'

export function useQuoteFilters(filters: FiltersList, clientes: ClientFilter[]) {
  const router = useRouter()
  const [pending, iniciarNavigation] = useTransition()
  // Los de la URL, o los recién elegidos mientras se navega hacia ellos. Sin navegación pendiente son `filtros`, así
  // que los selects siguen a la URL cuando cambia desde afuera (chips, "Limpiar filtros", atrás del navegador).
  const [vigentes, adelantar] = useOptimistic(
    filters,
    (actuales: FiltersList, changes: Partial<FiltersList>): FiltersList => ({ ...actuales, ...changes }),
  )
  const search = useRef<HTMLInputElement>(null)
  // La última búsqueda de la URL que se reflejó en el buscador.
  const qReflejada = useRef(filters.q)

  // Si la búsqueda cambia desde afuera ("Limpiar filtros", atrás o adelante del navegador), el buscador vuelve a leer
  // la URL aunque tenga el foco, salvo que se haya tipeado algo distinto de lo que mostraba: eso no se pisa. Se decide
  // por el contenido y no por el foco porque después de buscar con Enter el foco se queda en el buscador.
  useEffect(() => {
    const field = search.current
    // El texto se normaliza como el de la URL (espacios, largo máximo) para compararlo con la búsqueda que mostraba.
    if (field && readFilters({ q: field.value }).q === qReflejada.current) field.value = filters.q
    qReflejada.current = filters.q
  }, [filters.q])

  function apply(changes: Partial<FiltersList>) {
    iniciarNavigation(() => {
      adelantar(changes)
      // Sobre `vigentes`: dos cambios seguidos no se pisan aunque el primero todavía no haya llegado a la URL.
      router.push(hrefWithFilters(vigentes, changes), { scroll: false })
    })
  }

  // Los chips siguen la selección optimista mientras llega la navegación.
  const chips: { clave: string; texto: string; quitar: Partial<FiltersList> }[] = []
  if (vigentes.q) {
    chips.push({ clave: 'busqueda', texto: `Búsqueda: ${vigentes.q}`, quitar: { q: '' } })
  }
  if (vigentes.estado) {
    chips.push({ clave: 'estado', texto: STATUSES_QUOTE[vigentes.estado].label, quitar: { estado: '' } })
  }
  if (vigentes.cliente) {
    const cliente = clientes.find((c) => c.id === vigentes.cliente)
    chips.push({ clave: 'cliente', texto: cliente?.razon_social ?? 'Cliente', quitar: { cliente: '' } })
  }
  if (vigentes.desde || vigentes.hasta) {
    const texto = textRangoDates(vigentes.desde, vigentes.hasta)
    chips.push({ clave: 'fechas', texto, quitar: { desde: '', hasta: '' } })
  }

  return { pending, vigentes, search, apply, chips }
}
