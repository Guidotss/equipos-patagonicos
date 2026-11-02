import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listActiveEquipment, listUserAccess } from '@/lib/crane-operators/queries'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { SheetForm } from '@/components/form/structure-form'
import { UserAccessForm } from '@/components/crane-operators/user-access-form'

export const metadata: Metadata = { title: 'Usuarios y grúas' }

export default async function UserAccessPage() {
  const currentUser = await requireAdmin()
  const client = await createClient()
  const [users, equipment] = await Promise.all([listUserAccess(client), listActiveEquipment(client)])
  return <>
    <BarCrumbs crumbs={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Usuarios y grúas' }]} />
    <Content>
      <HeaderPage compact titulo="Usuarios y grúas" descripcion="Administrá el rol, el acceso y la grúa asignada a cada persona." />
      <SheetForm>{users.map((user) => <UserAccessForm key={`${user.userId}-${user.role}-${user.active}-${user.equipmentId}`} user={user} equipment={equipment} currentUserId={currentUser.id} />)}</SheetForm>
    </Content>
  </>
}
