import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { RowListing } from '@/components/listings/row-listing'
import { TableListing } from '@/components/listings/table-listing'
import { Pill } from '@/components/ui/pill'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatShortDate } from '@/lib/format/dates'
import { formatCurrency } from '@/lib/format/amounts'
import { STATUSES_BUDGET } from '@/lib/budgets/list'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type RowBudget = Database['public']['Functions']['buscar_presupuestos']['Returns'][number]

export function TableBudgets({ budgets }: { budgets: RowBudget[] }) {
  return (
    <>
      <div className="hidden @min-[44rem]/listado:block">
        <TableListing aria-label="Presupuestos">
          <colgroup>
            <col className="w-28" />
            <col />
            <col className="w-28" />
            <col className="hidden w-40 @min-[52rem]/listado:table-column" />
            <col className="w-36" />
            <col className="w-16" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Presupuesto</TableHead>
              <TableHead scope="col">Cliente / trabajo</TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col" className="hidden @min-[52rem]/listado:table-cell">Documentos</TableHead>
              <TableHead scope="col" className="text-right">Saldo a cobrar</TableHead>
              <TableHead scope="col"><span className="sr-only">Abrir presupuesto</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgets.map((budget) => (
              <RowListing key={budget.id} href={`/presupuestos/${budget.id}`}>
                <TableCell>
                  <Link
                    href={`/presupuestos/${budget.id}`}
                    aria-label={`Presupuesto ${budget.numero}`}
                    className="font-semibold text-primary tabular-nums hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {budget.numero}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">{dateApproval(budget)}</p>
                </TableCell>
                <TableCell>
                  <Link href={`/presupuestos/${budget.id}`} className="font-medium leading-5 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                    {budget.cliente_razon_social}
                  </Link>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{budget.asunto || 'Sin trabajo indicado'}</p>
                  <DocumentsBudget presupuesto={budget} className="mt-3 @min-[52rem]/listado:hidden" />
                </TableCell>
                <TableCell><StatusBudget estado={budget.presupuesto_estado} /></TableCell>
                <TableCell className="hidden @min-[52rem]/listado:table-cell">
                  <DocumentsBudget presupuesto={budget} column />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCurrency(budget.saldo ?? 0)}</TableCell>
                <TableCell className="px-2!">
                  <Link
                    href={`/presupuestos/${budget.id}`}
                    aria-label={`Abrir presupuesto ${budget.numero}`}
                    className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Abrir <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </TableCell>
              </RowListing>
            ))}
          </TableBody>
        </TableListing>
      </div>
      <ul className="divide-y @min-[44rem]/listado:hidden">
        {budgets.map((budget) => (
          <li key={budget.id}>
            <Link
              href={`/presupuestos/${budget.id}`}
              aria-label={`Abrir presupuesto ${budget.numero}`}
              className="block p-4 hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-primary tabular-nums">N° {budget.numero}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">{dateApproval(budget)}</p>
                </div>
                <StatusBudget estado={budget.presupuesto_estado} />
              </div>
              <p className="font-medium leading-6 [overflow-wrap:anywhere]">{budget.cliente_razon_social}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">{budget.asunto || 'Sin trabajo indicado'}</p>
              <DocumentsBudget presupuesto={budget} className="mt-3" />
              <dl className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
                <dt className="text-muted-foreground">Saldo a cobrar</dt>
                <dd className="text-right font-semibold tabular-nums">{formatCurrency(budget.saldo ?? 0)}</dd>
              </dl>
              <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">Abrir presupuesto <ArrowUpRight className="size-3.5" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function DocumentsBudget({ presupuesto: budget, column = false, className }: {
  presupuesto: RowBudget
  column?: boolean
  className?: string
}) {
  const documentos = [
    ['Órdenes de compra', 'OC', budget.ordenes_compra],
    ['Remitos', 'Remitos', budget.remitos],
    ['Facturas', 'Facturas', budget.facturas],
    ['Órdenes de pago', 'OP', budget.ordenes_pago],
  ] as const
  return (
    <dl className={cn(column ? 'grid grid-cols-2 gap-x-2 gap-y-1' : 'flex flex-wrap gap-x-4 gap-y-1', 'text-xs', className)}>
      {documentos.map(([label, corta, cantidad]) => (
        <div key={label} className="flex items-baseline gap-1">
          <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{column && corta !== label ? <abbr title={label} className="no-underline">{corta}</abbr> : label}</dt>
          <dd className="shrink-0 font-medium tabular-nums">{cantidad ?? 0}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusBudget({ estado }: { estado: string | null }) {
  const tone = estado === 'en_curso' ? 'info' : estado === 'finalizado' ? 'exito' : 'neutro'
  return <Pill tone={tone}>{STATUSES_BUDGET[estado as keyof typeof STATUSES_BUDGET] ?? 'Sin estado'}</Pill>
}

function dateApproval(budget: RowBudget) {
  return budget.fecha_aprobacion ? formatShortDate(budget.fecha_aprobacion) : 'Sin fecha'
}
