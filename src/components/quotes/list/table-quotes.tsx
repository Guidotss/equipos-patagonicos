import Link from 'next/link'
import { StatusQuote } from '@/components/quotes/status-quote'
import { ActionsRow } from '@/components/quotes/list/actions-row'
import { RowListing } from '@/components/listings/row-listing'
import { TableListing } from '@/components/listings/table-listing'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listTransitions } from '@/lib/quotes/actions-status'
import type { RowQuote } from '@/lib/quotes/list-view'
import { cn } from '@/lib/utils'

export function TableQuotes({ rows }: { rows: RowQuote[] }) {
  return (
    <TableListing>
      <colgroup>
        <col className="w-33" />
        <col />
        <col className="w-32" />
        <col className="w-32" />
        <col className="w-19" />
      </colgroup>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Cotización</TableHead>
          <TableHead>Cliente / trabajo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead><span className="sr-only">Acciones</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <RowListing key={row.id} href={`/cotizaciones/${row.id}`}>
            <TableCell>
              <Link
                href={`/cotizaciones/${row.id}`}
                className="rounded-sm font-semibold text-primary tabular-nums underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {row.numero}
              </Link>
              <p className="mt-1 text-xs leading-5 text-muted-foreground tabular-nums">{row.fecha}</p>
              <p className="text-xs leading-5 text-muted-foreground">{row.origen ?? row.formato}</p>
            </TableCell>
            <TableCell>
              <p className="font-medium leading-5">{row.cliente}</p>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{row.trabajo}</p>
            </TableCell>
            <TableCell><StatusQuote estado={row.estado} vencida={row.vencida} /></TableCell>
            <TableCell>
              {row.venceEl ? (
                <span className={cn('whitespace-nowrap tabular-nums', row.vencida && 'text-amber-700')}>{row.venceEl}</span>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="px-2!">
              <ActionsRow
                id={row.id}
                numero={row.numero}
                tienePdf={row.tienePdf}
                transiciones={listTransitions(row)}
              />
            </TableCell>
          </RowListing>
        ))}
      </TableBody>
    </TableListing>
  )
}
