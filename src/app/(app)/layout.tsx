import { AppShell } from '@/components/app-shell/app-shell'
import { requireUsuario } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario()
  return <AppShell usuario={usuario}>{children}</AppShell>
}
