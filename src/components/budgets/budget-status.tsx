import { Pill } from '@/components/ui/pill'
import { STATUSES_BUDGET } from '@/lib/budgets/list'

type BudgetStatusProps = {
  status: string | null
  invoices: number | null
  paymentOrders: number | null
}

export function BudgetStatus({
  status,
  invoices,
  paymentOrders,
}: BudgetStatusProps) {
  const collecting = (invoices ?? 0) > 0 || (paymentOrders ?? 0) > 0
  const tone =
    status === 'finalizado'
      ? 'exito'
      : status === 'en_curso'
        ? collecting
          ? 'aviso'
          : 'info'
        : 'neutro'
  const label =
    STATUSES_BUDGET[status as keyof typeof STATUSES_BUDGET] ?? 'Sin estado'
  return <Pill tone={tone}>{label}</Pill>
}
