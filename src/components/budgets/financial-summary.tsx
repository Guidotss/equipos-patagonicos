import Link from 'next/link'
import {
  centsToDecimal,
  formatFinancialAmount,
  parseAggregateCents,
  sumCents,
} from '@/lib/finance/amounts'
import type { Document } from '@/lib/documents/screens'
import type { HistoricalAdvance } from '@/lib/finance/historical-advances'

type FinancialSummaryProps = {
  billed: string
  credited: string
  withheld: string
  legacy: string
  advances: string
  pendingChecks: string
  balance: string | null
  documents: Document[]
  historicalAdvances?: HistoricalAdvance[]
}

export function FinancialSummary({
  billed,
  credited,
  withheld,
  legacy,
  advances,
  pendingChecks,
  balance,
  documents,
  historicalAdvances = [],
}: FinancialSummaryProps) {
  const cancelled = centsToDecimal(
    sumCents(
      [credited, withheld, legacy].map((amount) => parseAggregateCents(amount)),
    ),
  )
  const credit = balance?.startsWith('-')
  const unresolved = documents
  return (
    <section
      aria-label="Resumen financiero"
      className="rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
        <SummaryItem label="Facturado" value={billed} />
        <SummaryItem
          label="Cancelado"
          value={cancelled}
          detail={
            parseAggregateCents(advances) > BigInt(0)
              ? 'Incluye anticipos'
              : undefined
          }
        />
        <div>
          <p className="text-sm text-muted-foreground">
            {credit ? 'Crédito a favor' : 'Saldo a cobrar'}
          </p>
          <p
            className="text-xl font-semibold tabular-nums"
            data-testid="saldo-presupuesto"
          >
            {balance === null
              ? 'Saldo pendiente de distribución'
              : formatFinancialAmount(credit ? balance.slice(1) : balance)}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 border-t pt-4 text-sm">
        <SummaryLine label="Dinero acreditado" value={credited} />
        <SummaryLine label="Retenciones" value={withheld} />
        {parseAggregateCents(legacy) > BigInt(0) ? (
          <SummaryLine
            label="Cancelaciones anteriores sin medio identificado"
            value={legacy}
          />
        ) : null}
      </dl>
      <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-x-6 gap-y-2 border-t pt-4 text-sm">
        <SummaryLine label="Anticipos sin aplicar" value={advances} />
        <SummaryLine label="Cheques pendientes" value={pendingChecks} />
      </dl>
      {historicalAdvances.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Los anticipos incluyen cancelaciones históricas de facturas anuladas:{' '}
          {historicalAdvances.map(({ document, amount }, index) => (
            <span key={document.id}>
              {index ? ', ' : ''}
              <Link
                className="text-primary underline"
                href={`/documentos/${document.id}`}
              >
                {document.numero || 'Factura sin número'}
              </Link>{' '}
              ({formatFinancialAmount(amount)})
            </span>
          ))}
          . Revisá el comprobante para restaurarlo.
        </p>
      ) : null}
      {balance === null ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Revisá la distribución de las facturas y órdenes de pago vinculadas:{' '}
          {unresolved.map((document, index) => (
            <span key={document.id}>
              {index ? ', ' : ''}
              <Link
                className="text-primary underline"
                href={`/documentos/${document.id}`}
              >
                {document.numero ||
                  (document.tipo === 'factura'
                    ? 'Factura sin número'
                    : 'Orden de pago sin número')}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}
    </section>
  )
}

function SummaryItem({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {formatFinancialAmount(value)}
      </p>
      {detail ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-nowrap tabular-nums">
        {formatFinancialAmount(value)}
      </dd>
    </div>
  )
}
