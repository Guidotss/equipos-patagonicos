import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { EditorTemplate } from '@/components/settings/editor-template'
import { statusNew } from '@/lib/quotes/editor'
import { todayArgentina } from '@/lib/format/dates'
import { readBlocks, readItemsTemplate, type Format } from '@/lib/templates/content'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  const template = { ...data, formato: data.formato as Format, items: readItemsTemplate(data.items), bloques: readBlocks(data.bloques) }
  const initial = statusNew({ plantilla: template, firmanteId: '', today: todayArgentina() })
  return <><BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Plantillas', href: '/configuracion/plantillas' }, { texto: 'Editar contenido' }]} /><EditorTemplate id={id} nombre={data.nombre} initial={initial} plantilla={template} /></>
}
