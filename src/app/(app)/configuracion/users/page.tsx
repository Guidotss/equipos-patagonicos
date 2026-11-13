import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listUserAccess } from '@/lib/crane-operators/queries'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { SheetForm } from '@/components/form/structure-form'
import { UserAccessForm } from '@/components/crane-operators/user-access-form'

export const metadata: Metadata = { title: 'Usuarios' }

export default async function UserAccessPage() {
  const currentUser = await requireAdmin()
  const users = await listUserAccess(await createClient())
  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Usuarios' },
        ]}
      />
      <Content>
        <HeaderPage
          compact
          titulo="Usuarios"
          descripcion="Administrá el rol y el acceso de cada persona."
        />
        <SheetForm>
          {users.map((user) => (
            <UserAccessForm
              key={`${user.userId}-${user.role}-${user.active}`}
              user={user}
              currentUserId={currentUser.id}
            />
          ))}
        </SheetForm>
      </Content>
    </>
  )
}
