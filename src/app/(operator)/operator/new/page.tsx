import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCraneOperator } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCraneOperatorContext } from '@/lib/crane-operators/queries'
import { todayArgentina } from '@/lib/format/dates'
import { HeaderForm } from '@/components/form/structure-form'
import { EquipmentContext } from '@/components/crane-operators/equipment-context'
import { NoteForm } from '@/components/crane-operators/note-form'

export const metadata: Metadata = { title: 'Cargar remito' }

export default async function NewOperatorNote() {
  await requireCraneOperator()
  const context = await getCraneOperatorContext(await createClient())
  return <>
    <Link href="/operator" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Mis remitos</Link>
    <HeaderForm titulo="Cargar remito" descripcion="Adjuntá el remito del trabajo realizado." />
    <EquipmentContext equipment={context.equipment} />
    <NoteForm context={context} today={todayArgentina()} />
  </>
}
