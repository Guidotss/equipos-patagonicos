import type { Metadata } from 'next'
import { BarCrumbs } from '@/components/app-shell/header'
import { CompanyForm } from '@/components/settings/company-form'
import { requireStaff } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { todayArgentina } from '@/lib/format/dates'
import { createClient } from '@/lib/supabase/server'
import { actualizarCompany } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

export default async function CompanyPage() {
  const user = await requireStaff()
  const supabase = await createClient()
  const { data: company, error } = await supabase
    .from('empresa_config')
    .select('*')
    .single()
  if (error) throw error

  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Empresa' },
        ]}
      />
      <CompanyForm
        accion={actualizarCompany}
        initial={{
          ...company,
          cuit: company.cuit ? formatCuit(company.cuit) : '',
        }}
        soloQuery={user.rol !== 'admin'}
        today={todayArgentina()}
      />
    </>
  )
}
