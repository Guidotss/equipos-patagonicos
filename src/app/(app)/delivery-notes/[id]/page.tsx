import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { isUuid } from '@/lib/validation'
import { createClient } from '@/lib/supabase/server'
import { getCraneDeliveryNote, getLiveDeliveryNoteBudgetId, listLinkableBudgets } from '@/lib/crane-operators/queries'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { HeaderForm } from '@/components/form/structure-form'
import { NoteDetail } from '@/components/crane-operators/note-detail'
import { NoteStatus } from '@/components/crane-operators/note-status'
import { LinkNoteForm } from '@/components/crane-operators/link-note-form'
import { Button } from '@/components/ui/button'

export default async function DeliveryNotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const client = await createClient()
  const note = await getCraneDeliveryNote(client, id)
  if (!note) notFound()
  const [budgets, liveBudgetId] = await Promise.all([
    note.status === 'pending' ? listLinkableBudgets(client) : null,
    note.linkedBudgetId ? getLiveDeliveryNoteBudgetId(client, note.linkedBudgetId) : null,
  ])
  return <>
    <BarCrumbs crumbs={[{ texto: 'Remitos', href: '/delivery-notes' }, { texto: note.number || 'Sin número' }]} />
    <Content className="max-w-5xl">
      <HeaderForm titulo={note.number ? `Remito ${note.number}` : 'Remito sin número'} estado={<NoteStatus status={note.status} />} actions={note.documentId ? <Button asChild variant="outline"><Link href={`/documentos/${note.documentId}`}>Ver documento</Link></Button> : undefined} />
      <NoteDetail note={note} staff />
      {budgets ? <LinkNoteForm noteId={id} initial={budgets} /> : null}
      {liveBudgetId ? <Button asChild variant="outline"><Link href={`/presupuestos/${liveBudgetId}`}>Ver presupuesto vinculado</Link></Button> : note.linkedBudgetId ? <p className="text-sm text-muted-foreground">El presupuesto original ya no está disponible.</p> : null}
    </Content>
  </>
}
