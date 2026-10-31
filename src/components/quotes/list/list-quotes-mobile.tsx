import Link from 'next/link'
import { StatusQuote } from '@/components/quotes/status-quote'
import { ActionsRow } from '@/components/quotes/list/actions-row'
import { transicionesOfList } from '@/lib/quotes/actions-status'
import type { RowQuote } from '@/lib/quotes/list-view'
import { cn } from '@/lib/utils'

/** La lista en tarjetas angostas (celular o tablet chica): toda la fila abre la cotización y el ⋯ lleva el resto. */
export function ListQuotesMobile({ rows }: { rows: RowQuote[] }) {
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className="relative px-4 py-4 transition-colors hover:bg-accent/30 focus-within:bg-accent/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              {/* El after: estira el link a toda la fila; el ⋯ queda por encima con z-10. */}
              <Link href={`/cotizaciones/${row.id}`} className="font-semibold text-primary tabular-nums after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring">
                N° {row.numero}
              </Link>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground tabular-nums">{row.fecha} · {row.origen ?? row.formato}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <StatusQuote estado={row.estado} vencida={row.vencida} />
              <div className="relative z-10">
                <ActionsRow id={row.id} numero={row.numero} tienePdf={row.tienePdf} transiciones={transicionesOfList(row)} variante="movil" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[15px] leading-5 font-medium wrap-anywhere">{row.cliente}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground wrap-anywhere" title={row.trabajo}>{row.trabajo}</p>
          {row.venceEl ? <p className={cn('mt-3 border-t pt-3 text-[13px] tabular-nums', row.vencida ? 'text-amber-700' : 'text-muted-foreground')}>
            {`${row.vencida ? 'Venció' : 'Vence'} el ${row.venceEl}`}
          </p> : null}
        </li>
      ))}
    </ul>
  )
}
