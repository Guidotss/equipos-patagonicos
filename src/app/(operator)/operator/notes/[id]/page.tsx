import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireCraneOperator } from '@/lib/auth'
import { isUuid } from '@/lib/validation'
import { createClient } from '@/lib/supabase/server'
import { getCraneDeliveryNote } from '@/lib/crane-operators/queries'
import { NoteDetail } from '@/components/crane-operators/note-detail'
import { NoteStatus } from '@/components/crane-operators/note-status'
import { HeaderForm } from '@/components/form/structure-form'

export default async function OperatorNotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireCraneOperator()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const note = await getCraneDeliveryNote(await createClient(), id)
  if (!note || note.operatorId !== user.id) notFound()
  return (
    <>
      <Link
        href="/operator"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mis remitos
      </Link>
      <HeaderForm
        titulo={note.number ? `Remito ${note.number}` : 'Remito sin número'}
        estado={<NoteStatus status={note.status} />}
      />
      <NoteDetail note={note} />
    </>
  )
}
