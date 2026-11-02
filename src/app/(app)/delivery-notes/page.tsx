import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listCraneDeliveryNotes } from '@/lib/crane-operators/queries'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { NoteList } from '@/components/crane-operators/note-list'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { Button } from '@/components/ui/button'
import { Count } from '@/components/ui/count'

export const metadata: Metadata = { title: 'Remitos de gruistas' }

export default async function DeliveryNotesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireStaff()
  const params = await searchParams
  const status = params.status === 'linked' ? 'linked' : 'pending'
  const page = params.page && /^[1-9]\d{0,3}$/.test(params.page) ? Number(params.page) : 1
  const history = await listCraneDeliveryNotes(await createClient(), { status, page })
  const validPage = Math.min(history.page, Math.max(1, Math.ceil(history.total / history.pageSize)))
  if (page !== validPage) redirect(`/delivery-notes?status=${status}${validPage > 1 ? `&page=${validPage}` : ''}`)
  return <>
    <BarCrumbs crumbs={[{ texto: 'Remitos' }]} />
    <Content>
      <HeaderPage compact titulo="Remitos" extra={<Count>{history.total}</Count>} descripcion="Remitos enviados por los gruistas para revisar y vincular." />
      <FrameListing tools={<nav aria-label="Estado de los remitos" className="flex flex-wrap gap-2">
        <Button asChild variant={status === 'pending' ? 'secondary' : 'ghost'} className="min-h-11"><Link href="/delivery-notes" aria-current={status === 'pending' ? 'page' : undefined}>Pendientes</Link></Button>
        <Button asChild variant={status === 'linked' ? 'secondary' : 'ghost'} className="min-h-11"><Link href="/delivery-notes?status=linked" aria-current={status === 'linked' ? 'page' : undefined}>Vinculados</Link></Button>
      </nav>} pie={<PaginationListing total={history.total} pagina={page} tamano={history.pageSize} href={(next) => `/delivery-notes?status=${status}&page=${next}`} />}><NoteList notes={history.notes} staff /></FrameListing>
    </Content>
  </>
}
