import { Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { FiltersBudgets } from '@/components/budgets/filters-budgets'
import { TableBudgets } from '@/components/budgets/table-budgets'
import { Button } from '@/components/ui/button'
import { Count } from '@/components/ui/count'
import { hrefBudgets, readFiltersBudgets, PER_PAGE } from '@/lib/budgets/list'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Presupuestos' }

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = readFiltersBudgets(await searchParams)
  const supabase = await createClient()
  const home = (filters.pagina - 1) * PER_PAGE
  const [search, clientes] = await Promise.all([
    supabase
      .rpc(
        'buscar_presupuestos',
        { texto: filters.q, estado: filters.estado, cliente: filters.cliente || undefined },
        { count: 'exact' },
      )
      .select('*')
      .order('numero', { ascending: false })
      .range(home, home + PER_PAGE - 1),
    supabase.from('clientes').select('id, razon_social').order('razon_social'),
  ])
  if (search.error?.code === 'PGRST103') redirect(hrefBudgets(filters))
  if (search.error) throw search.error
  if (clientes.error) throw clientes.error
  const total = search.count ?? 0
  const pages = Math.ceil(total / PER_PAGE)
  if (total > 0 && filters.pagina > pages) redirect(hrefBudgets(filters, pages))
  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Presupuestos' }]} />
      <Content>
        <HeaderPage
          compact
          titulo="Presupuestos"
          extra={<Count>{total}</Count>}
          descripcion="Cotizaciones aprobadas y sus documentos comerciales."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/documentos/nuevo">
                  <Upload data-icon="inline-start" />
                  Subir documento
                </Link>
              </Button>
              <Button asChild>
                <Link href="/cotizaciones/directo">
                  <Plus data-icon="inline-start" />
                  Presupuesto directo
                </Link>
              </Button>
            </>
          }
        />
        <FrameListing
          tools={<FiltersBudgets filters={filters} clientes={clientes.data} />}
          pie={<PaginationListing total={total} pagina={filters.pagina} tamano={PER_PAGE} href={(pagina) => hrefBudgets(filters, pagina)} />}
        >
          {search.data.length ? (
            <TableBudgets budgets={search.data} />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-muted-foreground">
                No hay presupuestos {filters.q || filters.estado || filters.cliente ? 'con estos filtros.' : 'todavía.'}
              </p>
              <Button variant="link" asChild>
                <Link href={filters.q || filters.estado || filters.cliente ? '/presupuestos' : '/cotizaciones/directo'}>
                  {filters.q || filters.estado || filters.cliente ? 'Limpiar filtros' : 'Crear presupuesto directo'}
                </Link>
              </Button>
            </div>
          )}
        </FrameListing>
      </Content>
    </>
  )
}
