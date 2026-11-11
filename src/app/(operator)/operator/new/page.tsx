import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireCraneOperator } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listOperatorCranes } from '@/lib/crane-operators/queries'
import { todayArgentina } from '@/lib/format/dates'
import { isUuid } from '@/lib/validation'
import { HeaderForm } from '@/components/form/structure-form'
import { IconCrane } from '@/components/settings/icon-crane'
import { NoteForm } from '@/components/crane-operators/note-form'

export const metadata: Metadata = { title: 'Cargar remito' }

export default async function NewOperatorNote({ searchParams }: { searchParams: Promise<{ equipment?: string | string[] }> }) {
  await requireCraneOperator()
  const { equipment } = await searchParams
  if (typeof equipment !== 'string' || !isUuid(equipment)) redirect('/operator')
  const cranes = await listOperatorCranes(await createClient())
  const crane = cranes.find(({ id }) => id === equipment.toLowerCase())
  if (!crane) redirect('/operator')

  return <>
    <Link href="/operator" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Mis remitos</Link>
    <HeaderForm titulo="Cargar remito" descripcion="Adjuntá el remito del trabajo realizado." />
    <div className="flex items-center gap-4 border-b pb-5">
      <IconCrane className="size-9 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Grúa del remito</p>
        <p className="text-lg font-medium [overflow-wrap:anywhere]">{crane.name}</p>
      </div>
    </div>
    <NoteForm key={crane.id} equipmentId={crane.id} today={todayArgentina()} />
  </>
}
