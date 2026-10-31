// src/app/(app)/cotizaciones/nueva/page.tsx
import type { Metadata } from 'next'
import { BarCrumbs } from '@/components/app-shell/header'
import { EditorQuote } from '@/components/quotes/editor/editor-quote'
import { statusNew } from '@/lib/quotes/editor/state'
import { defaultSigner } from '@/lib/quotes/editor-screen'
import { readCatalogsEditor, readLastSigner, readContacts } from '@/lib/quotes/queries-editor'
import { todayArgentina } from '@/lib/format/dates'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const metadata: Metadata = { title: 'Nueva cotización' }

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ cliente?: string; plantilla?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const catalogs = await readCatalogsEditor(supabase)
  const lastSigner = await readLastSigner(supabase, catalogs.firmantes)
  const today = todayArgentina()
  const initial = statusNew({
    plantilla: catalogs.plantillas.find((p) => p.id === params.plantilla) ?? catalogs.plantillas[0] ?? null,
    firmanteId: defaultSigner(catalogs.firmantes, lastSigner),
    today,
  })
  if (params.cliente && isUuid(params.cliente)) {
    const { data, error } = await supabase.from('clientes').select('id,razon_social,cuit').eq('id', params.cliente).maybeSingle()
    if (error) throw error
    initial.cliente = data
  }
  const contacts = initial.cliente ? await readContacts(supabase, initial.cliente.id) : []

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Nueva' }]} />
      <EditorQuote initial={initial} catalogs={catalogs} contacts={contacts} today={today} />
    </>
  )
}
