import { FileText, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { FiltersQuotes } from '@/components/quotes/list/filters-quotes'
import { ListQuotesMobile } from '@/components/quotes/list/list-quotes-mobile'
import { Pagination } from '@/components/quotes/list/pagination'
import { TableQuotes } from '@/components/quotes/list/table-quotes'
import { FrameListing } from '@/components/listings/frame-listing'
import { Button } from '@/components/ui/button'
import { Count } from '@/components/ui/count'
import { hrefWithFilters, readFilters, PER_PAGE } from '@/lib/quotes/list'
import { rowQuote, totalPages } from '@/lib/quotes/list-view'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Cotizaciones' }

/**
 * Solo lo que muestra la lista: sin intro, bloques ni ítems (nunca montos, diseño §5). Del equipo embebido, el nombre
 * para la columna Trabajo ("{equipo} · {ubicación}", resumenCotizacion).
 */
const COLUMNAS =
  'id, numero, origen, fecha, cliente_razon_social, formato, estado, vencida, vence_el, asunto, datos, equipo:equipos(nombre)'

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <FileText className="mb-1 size-6 text-muted-foreground" aria-hidden />
      {children}
    </div>
  )
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = readFilters(await searchParams)
  const home = (filters.pagina - 1) * PER_PAGE
  const supabase = await createClient()

  const [search, withQuotes] = await Promise.all([
    supabase
      .rpc(
        'buscar_cotizaciones',
        {
          texto: filters.q,
          estado: filters.estado,
          cliente: filters.cliente || undefined,
          desde: filters.desde || undefined,
          hasta: filters.hasta || undefined,
        },
        { count: 'exact' },
      )
      .select(COLUMNAS)
      .order('numero', { ascending: false })
      .range(home, home + PER_PAGE - 1),
    // Para el filtro: los clientes que tienen alguna cotización (el embebido vacío con !inner solo filtra).
    supabase.from('clientes').select('id, razon_social, cotizaciones!inner()').order('razon_social'),
  ])
  // Una página más allá del total (URL vieja, cotizaciones borradas) responde 416: se vuelve a la primera.
  if (search.error?.code === 'PGRST103') redirect(hrefWithFilters(filters, { pagina: 1 }))
  if (search.error) throw search.error
  if (withQuotes.error) throw withQuotes.error

  const total = search.count ?? 0
  const pages = totalPages(total)
  // Justo al final (offset = total) PostgREST no da 416 sino una página vacía: se va a la última.
  if (total > 0 && filters.pagina > pages) redirect(hrefWithFilters(filters, { pagina: pages }))

  const rows = search.data.map(rowQuote)
  const hasFilters = Boolean(filters.q || filters.estado || filters.cliente || filters.desde || filters.hasta)

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Cotizaciones' }]} />
      <Content>
        {/* El único heading con "Cotizaciones": tests/e2e/auth.spec.ts lo busca por substring. */}
        <HeaderPage
          titulo="Cotizaciones"
          compact
          extra={<Count>{total}</Count>}
          actions={
            <>
              <Button asChild variant="outline" className="h-10 px-3"><Link href="/cotizaciones/cargar">Cargar existente</Link></Button>
              <Button asChild variant="outline" className="h-10 px-3"><Link href="/cotizaciones/directo">Presupuesto directo</Link></Button>
              <Button asChild className="h-10 px-3.5">
                <Link href="/cotizaciones/nueva">
                  <Plus aria-hidden />
                  Nueva cotización
                </Link>
              </Button>
            </>
          }
        />

        <FrameListing
          className="group/lista"
          tools={<FiltersQuotes filters={filters} clientes={withQuotes.data} />}
          pie={<Pagination filters={filters} total={total} />}
        >
          <div className="transition-opacity group-has-[[data-pendiente]]/lista:opacity-60">
            {total === 0 && !hasFilters ? (
              <Empty>
                <p className="font-medium">Todavía no hay cotizaciones.</p>
                <p className="text-sm text-muted-foreground">Creá la primera con “Nueva cotización”.</p>
                <Button asChild className="mt-2"><Link href="/cotizaciones/nueva"><Plus aria-hidden />Nueva cotización</Link></Button>
              </Empty>
            ) : total === 0 ? (
              <Empty>
                <p className="text-muted-foreground">
                  {filters.q
                    ? `No hay cotizaciones que coincidan con "${filters.q}".`
                    : 'No hay cotizaciones con estos filtros.'}
                </p>
                <Button asChild variant="link">
                  <Link href="/cotizaciones">Limpiar filtros</Link>
                </Button>
              </Empty>
            ) : (
              <>
                <div className="hidden @min-[44rem]/listado:block">
                  <TableQuotes rows={rows} />
                </div>
                <div className="@min-[44rem]/listado:hidden">
                  <ListQuotesMobile rows={rows} />
                </div>
              </>
            )}
          </div>
        </FrameListing>
      </Content>
    </>
  )
}
