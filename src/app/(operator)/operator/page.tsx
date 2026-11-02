import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { requireCraneOperator } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCraneOperatorContext, listCraneDeliveryNotes } from '@/lib/crane-operators/queries'
import { Button } from '@/components/ui/button'
import { HeaderForm } from '@/components/form/structure-form'
import { EquipmentContext } from '@/components/crane-operators/equipment-context'
import { NoteList } from '@/components/crane-operators/note-list'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'

export const metadata: Metadata = { title: 'Mis remitos' }

export default async function OperatorHome({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireCraneOperator()
  const { page: rawPage } = await searchParams
  const page = rawPage && /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1
  const client = await createClient()
  const [context, history] = await Promise.all([getCraneOperatorContext(client), listCraneDeliveryNotes(client, { operatorId: user.id, page })])
  const validPage = Math.min(history.page, Math.max(1, Math.ceil(history.total / history.pageSize)))
  if (page !== validPage) redirect(validPage === 1 ? '/operator' : `/operator?page=${validPage}`)
  return <>
    <HeaderForm titulo="Mis remitos" descripcion="Remitos de los trabajos que realizaste." actions={context.equipment?.active ? <Button asChild className="min-h-11"><Link href="/operator/new"><Plus data-icon="inline-start" />Cargar remito</Link></Button> : undefined} />
    <EquipmentContext equipment={context.equipment} />
    <FrameListing tools={<h2 className="font-semibold">Historial de remitos</h2>} pie={<PaginationListing total={history.total} pagina={page} tamano={history.pageSize} href={(next) => `/operator?page=${next}`} />}><NoteList notes={history.notes} /></FrameListing>
  </>
}
