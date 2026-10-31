'use client'

import { STATUSES_QUOTE } from '@/components/quotes/status-quote'
import { hrefWithFilters, readFilters, type FiltersList } from '@/lib/quotes/list'
import { formatDateRange } from '@/lib/quotes/list-view'
import { useRouter } from 'next/navigation'
import { useEffect, useOptimistic, useRef, useTransition } from 'react'

import type { ClientFilter } from './quote-filter-model'

export function useQuoteFilters(filters: FiltersList, clients: ClientFilter[]) {
  const router = useRouter()
  const [pending, startNavigation] = useTransition()
  // Los de la URL, o los recién elegidos mientras se navega hacia ellos. Sin navegación pendiente son `filtros`, así
  // que los selects siguen a la URL cuando cambia desde afuera (chips, "Limpiar filtros", atrás del navegador).
  const [activeFilters, applyOptimistic] = useOptimistic(
    filters,
    (current: FiltersList, changes: Partial<FiltersList>): FiltersList => ({ ...current, ...changes }),
  )
  const search = useRef<HTMLInputElement>(null)
  // La última búsqueda de la URL que se reflejó en el buscador.
  const reflectedQuery = useRef(filters.q)

  // Si la búsqueda cambia desde afuera ("Limpiar filtros", atrás o adelante del navegador), el buscador vuelve a leer
  // la URL aunque tenga el foco, salvo que se haya tipeado algo distinto de lo que mostraba: eso no se pisa. Se decide
  // por el contenido y no por el foco porque después de buscar con Enter el foco se queda en el buscador.
  useEffect(() => {
    const field = search.current
    // El texto se normaliza como el de la URL (espacios, largo máximo) para compararlo con la búsqueda que mostraba.
    if (field && readFilters({ q: field.value }).q === reflectedQuery.current) field.value = filters.q
    reflectedQuery.current = filters.q
  }, [filters.q])

  function apply(changes: Partial<FiltersList>) {
    startNavigation(() => {
      applyOptimistic(changes)
      // Sobre `vigentes`: dos cambios seguidos no se pisan aunque el primero todavía no haya llegado a la URL.
      router.push(hrefWithFilters(activeFilters, changes), { scroll: false })
    })
  }

  // Los chips siguen la selección optimista mientras llega la navegación.
  const chips: { key: string; text: string; remove: Partial<FiltersList> }[] = []
  if (activeFilters.q) {
    chips.push({ key: 'busqueda', text: `Búsqueda: ${activeFilters.q}`, remove: { q: '' } })
  }
  if (activeFilters.estado) {
    chips.push({ key: 'estado', text: STATUSES_QUOTE[activeFilters.estado].label, remove: { estado: '' } })
  }
  if (activeFilters.cliente) {
    const client = clients.find((c) => c.id === activeFilters.cliente)
    chips.push({ key: 'cliente', text: client?.razon_social ?? 'Cliente', remove: { cliente: '' } })
  }
  if (activeFilters.desde || activeFilters.hasta) {
    const text = formatDateRange(activeFilters.desde, activeFilters.hasta)
    chips.push({ key: 'fechas', text, remove: { desde: '', hasta: '' } })
  }

  return { pending, activeFilters, search, apply, chips }
}
