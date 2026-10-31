import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs } from '@/components/app-shell/header'
import { TemplateForm } from '@/components/settings/template-form'
import { ButtonStatus } from '@/components/form/button-status'
import { FORMATOS, readBlocks, readItemsTemplate, type Format } from '@/lib/templates/content'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { changeStatusTemplate, renameTemplate } from '../../actions'

export const metadata: Metadata = { title: 'Plantilla' }

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: template, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!template) notFound()

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Plantillas', href: '/configuracion/plantillas' },
          { texto: template.nombre },
        ]}
      />
      <TemplateForm
        editHref={`/configuracion/plantillas/${id}/editar`}
        accion={renameTemplate.bind(null, id)}
        plantilla={{
          nombre: template.nombre,
          formato: FORMATOS[template.formato as Format] ?? template.formato,
          activa: template.activa,
          validez_dias: template.validez_dias,
          asunto: template.asunto,
          intro: template.intro,
          items: readItemsTemplate(template.items),
          bloques: readBlocks(template.bloques),
        }}
        buttonStatus={
          <ButtonStatus
            grande
            activo={template.activa}
            label={template.nombre}
            accion={changeStatusTemplate.bind(null, id, !template.activa)}
          />
        }
      />
    </>
  )
}
