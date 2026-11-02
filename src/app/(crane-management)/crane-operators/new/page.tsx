import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth'
import { listActiveEquipment } from '@/lib/crane-operators/queries'
import { createClient } from '@/lib/supabase/server'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { HeaderForm } from '@/components/form/structure-form'
import { CreationForm } from '@/components/crane-operators/management/creation-form'

export const metadata: Metadata = { title: 'Nuevo gruista' }

export default async function NewCraneOperatorPage() {
  await requireStaff()
  const equipment = await listActiveEquipment(await createClient())
  return <>
    <BarCrumbs crumbs={[{ texto: 'Gruistas', href: '/crane-operators' }, { texto: 'Nuevo gruista' }]} />
    <Content className="max-w-6xl pb-28">
      <HeaderForm titulo="Nuevo gruista" descripcion="Creá su cuenta y asignale una grúa para que pueda enviar remitos." />
      <CreationForm equipment={equipment} />
    </Content>
  </>
}
