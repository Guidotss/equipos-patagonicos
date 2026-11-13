import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { listCraneOperators } from '@/lib/crane-operators/management-queries'
import {
  craneOperatorsHref,
  readManagementFilters,
  type ManagementSearchParams,
} from '@/lib/crane-operators/management-list'
import { createClient } from '@/lib/supabase/server'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { OperatorFilters } from '@/components/crane-operators/management/operator-filters'
import { OperatorList } from '@/components/crane-operators/management/operator-list'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { Button } from '@/components/ui/button'
import { Count } from '@/components/ui/count'

export const metadata: Metadata = { title: 'Gruistas' }

export default async function CraneOperatorsPage({
  searchParams,
}: {
  searchParams: Promise<ManagementSearchParams>
}) {
  await requireStaff()
  const params = await searchParams
  const filters = readManagementFilters(params)
  const directory = await listCraneOperators(await createClient(), filters)
  if (params.page !== undefined && params.page !== String(directory.page))
    redirect(craneOperatorsHref(filters, directory.page))
  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Gruistas' }]} />
      <Content>
        <HeaderPage
          compact
          titulo="Gruistas"
          extra={<Count>{directory.total}</Count>}
          descripcion="Accesos, grúas asignadas y remitos enviados."
          actions={
            <Button asChild className="min-h-11">
              <Link href="/crane-operators/new">
                <Plus aria-hidden data-icon="inline-start" />
                Nuevo gruista
              </Link>
            </Button>
          }
        />
        <FrameListing
          tools={<OperatorFilters filters={filters} />}
          pie={
            <PaginationListing
              total={directory.total}
              pagina={directory.page}
              tamano={directory.pageSize}
              href={(page) => craneOperatorsHref(filters, page)}
            />
          }
        >
          <OperatorList
            operators={directory.operators}
            filtered={Boolean(filters.q || filters.active !== 'all')}
          />
        </FrameListing>
      </Content>
    </>
  )
}
