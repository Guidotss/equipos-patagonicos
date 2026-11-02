import { AppShell } from '@/components/app-shell/app-shell'
import { requireStaff } from '@/lib/auth'

export default async function CraneManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  return <AppShell user={user}>{children}</AppShell>
}
