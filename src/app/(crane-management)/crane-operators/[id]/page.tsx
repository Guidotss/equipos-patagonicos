import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireStaff } from '@/lib/auth'
import { getManagedCraneOperator } from '@/lib/crane-operators/management-queries'
import { readManagementPage, type ManagementSearchParams } from '@/lib/crane-operators/management-list'
import { listCraneDeliveryNotes } from '@/lib/crane-operators/queries'
import { createClient } from '@/lib/supabase/server'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { AccessForm } from '@/components/crane-operators/management/access-form'
import { OperatorActivity } from '@/components/crane-operators/management/operator-activity'
import { SheetForm } from '@/components/form/structure-form'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { Count } from '@/components/ui/count'
import { Pill } from '@/components/ui/pill'

export const metadata: Metadata = { title: 'Actividad del gruista' }

export default async function CraneOperatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ManagementSearchParams> }) {
  await requireStaff()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const client = await createClient()
  const operator = await getManagedCraneOperator(client, id)
  if (!operator) notFound()
  const query = await searchParams
  const page = readManagementPage(query.page)
  const history = await listCraneDeliveryNotes(client, { operatorId: id, page, order: 'submission' })
  const validPage = Math.min(history.page, Math.max(1, Math.ceil(history.total / history.pageSize)))
  const activityHref = (next: number) => `/crane-operators/${id}${next > 1 ? `?page=${next}` : ''}`
  if (query.page !== undefined && query.page !== String(validPage)) redirect(activityHref(validPage))
  return <>
    <BarCrumbs crumbs={[{ texto: 'Gruistas', href: '/crane-operators' }, { texto: operator.name || operator.email }]} />
    <Content className="[&_h1]:[overflow-wrap:anywhere]">
      <HeaderPage compact titulo={operator.name || 'Sin nombre'} extra={<Pill tone={operator.active ? 'exito' : 'neutro'}>{operator.active ? 'Activo' : 'Inactivo'}</Pill>} descripcion={<span className="[overflow-wrap:anywhere]">{operator.email}</span>} />
      <SheetForm><AccessForm operator={operator} /></SheetForm>
      <section aria-labelledby="activity-title" className="flex min-w-0 flex-col gap-4">
        <div><div className="flex items-center gap-3"><h2 id="activity-title" className="text-xl font-semibold tracking-tight">Remitos enviados</h2><Count>{history.total}</Count></div><p className="mt-1 text-sm text-muted-foreground">Del envío más reciente al más antiguo.</p></div>
        <FrameListing tools={<p className="text-sm text-muted-foreground">La fecha del servicio y el momento del envío se muestran por separado. Hora argentina.</p>} pie={<PaginationListing total={history.total} pagina={validPage} tamano={history.pageSize} href={activityHref} />}><OperatorActivity notes={history.notes} /></FrameListing>
      </section>
    </Content>
  </>
}
