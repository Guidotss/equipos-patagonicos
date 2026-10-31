import type { Metadata } from 'next'
import { BarCrumbs } from '@/components/app-shell/header'
import { CompanyForm } from '@/components/settings/company-form'
import { requireUser } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { todayArgentina } from '@/lib/format/dates'
import { phrasesWithVariables } from '@/lib/templates/phrases'
import { createClient } from '@/lib/supabase/server'
import { actualizarCompany } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

export default async function CompanyPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const [{ data: company, error }, { data: plantillas, error: errorTemplates }] = await Promise.all([
    supabase.from('empresa_config').select('*').single(),
    supabase.from('plantillas').select('bloques').eq('activa', true),
  ])
  if (error) throw error
  if (errorTemplates) throw errorTemplates

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Empresa' }]} />
      <CompanyForm
        accion={actualizarCompany}
        initial={{ ...company, cuit: company.cuit ? formatCuit(company.cuit) : '' }}
        soloQuery={user.rol !== 'admin'}
        today={todayArgentina()}
        phrasesTarifas={phrasesWithVariables(plantillas, ['indice_base', 'proxima_actualizacion'])}
      />
    </>
  )
}
