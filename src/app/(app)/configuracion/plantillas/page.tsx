import type { Metadata } from 'next'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { Templates } from '@/components/settings/templates'
import { ButtonStatus } from '@/components/form/button-status'
import { FORMATS, type Format } from '@/lib/templates/content'
import { createClient } from '@/lib/supabase/server'
import { changeStatusTemplate } from '../actions'

export const metadata: Metadata = { title: 'Plantillas' }

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plantillas')
    .select('id, nombre, formato, activa')
    .order('activa', { ascending: false })
    .order('nombre')
  if (error) throw error

  const plantillas = data.map((template) => ({
    ...template,
    formato: FORMATS[template.formato as Format] ?? template.formato,
    button: (
      <ButtonStatus
        activo={template.activa}
        label={template.nombre}
        accion={changeStatusTemplate.bind(null, template.id, !template.activa)}
      />
    ),
  }))

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Plantillas' }]} />
      <Content>
        <HeaderPage
          titulo="Plantillas"
          descripcion="Creá plantillas desde una cotización o abrí una para editar sus textos e ítems."
        />
        <Templates plantillas={plantillas} />
      </Content>
    </>
  )
}
