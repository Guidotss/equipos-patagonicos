import { requireCraneOperator } from '@/lib/auth'
import { OperatorShell } from '@/components/crane-operators/operator-shell'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCraneOperator()
  return <OperatorShell user={user}>{children}</OperatorShell>
}
