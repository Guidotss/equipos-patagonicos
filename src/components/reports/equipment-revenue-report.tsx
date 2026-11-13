import Form from 'next/form'
import Link from 'next/link'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatFinancialAmount } from '@/lib/finance/amounts'
import {
  EQUIPMENT_REVENUE_PATH,
  equipmentRevenueHref,
  isRevenueDate,
  type EquipmentRevenueQuery,
  type RevenueReview,
  type RevenueReviewCategory,
  type RevenueSummary,
} from '@/lib/finance/report'

const reviewLabels = {
  unknown: 'Equipo desconocido',
  unallocated: 'Sin distribuir',
  undated: 'Facturas sin fecha',
} satisfies Record<RevenueReviewCategory, string>

const linkClass =
  'inline-flex min-h-11 min-w-11 max-w-full items-center rounded-sm text-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8'
const nameCell =
  'w-[39%] px-3 whitespace-normal wrap-anywhere md:w-auto md:px-4'
const countCell = 'w-[19%] px-1 text-right whitespace-normal md:w-32 md:px-4'
const amountCell =
  'w-[42%] px-3 text-right whitespace-normal wrap-anywhere md:w-[35%] md:px-4'

export function EquipmentRevenueReport({
  query,
  children,
}: {
  query: EquipmentRevenueQuery
  children: React.ReactNode
}) {
  return (
    <FrameListing
      tools={
        <DateFilters
          key={equipmentRevenueHref(query, query.review)}
          query={query}
        />
      }
    >
      {query.error ? (
        <div className="p-4">
          <Alert id="equipment-revenue-date-error" variant="destructive">
            <AlertDescription>{query.error}</AlertDescription>
          </Alert>
        </div>
      ) : (
        children
      )}
    </FrameListing>
  )
}

function DateFilters({ query }: { query: EquipmentRevenueQuery }) {
  return (
    <Form
      action={EQUIPMENT_REVENUE_PATH}
      aria-label="Período de facturación"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <DateField
        name="desde"
        label="Desde"
        value={query.from}
        error={query.error}
      />
      <DateField
        name="hasta"
        label="Hasta"
        value={query.to}
        error={query.error}
      />
      {query.review && (
        <input type="hidden" name="revisar" value={query.review} />
      )}
      <Button type="submit" className="h-11 px-4 sm:h-10">
        Aplicar filtros
      </Button>
    </Form>
  )
}

function DateField({
  name,
  label,
  value,
  error,
}: {
  name: string
  label: string
  value: string
  error: string | null
}) {
  const malformed = Boolean(value && !isRevenueDate(value))
  const id = `equipment-revenue-${name}`
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:w-48 lg:w-52">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type={malformed ? 'text' : 'date'}
        min={malformed ? undefined : '0001-01-01'}
        max={malformed ? undefined : '9999-12-31'}
        defaultValue={value}
        aria-invalid={Boolean(error?.includes(label)) || undefined}
        aria-describedby={error ? 'equipment-revenue-date-error' : undefined}
        className="h-11 min-w-0 sm:h-10"
      />
    </div>
  )
}

function InvoiceCount({ count }: { count: number }) {
  return (
    <span className="tabular-nums">
      {count.toLocaleString('es-AR')} {count === 1 ? 'factura' : 'facturas'}
    </span>
  )
}

function ReviewLink({
  query,
  category,
}: {
  query: EquipmentRevenueQuery
  category: RevenueReviewCategory
}) {
  return (
    <Link
      href={equipmentRevenueHref(query, category)}
      aria-label={`Revisar facturas · ${reviewLabels[category]}`}
      className={linkClass}
    >
      Revisar facturas
    </Link>
  )
}

export function EquipmentRevenueSummary({
  summary,
  query,
}: {
  summary: RevenueSummary
  query: EquipmentRevenueQuery
}) {
  const { period, groups } = summary
  return (
    <section aria-labelledby="equipment-revenue-period">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-5">
        <h2
          id="equipment-revenue-period"
          className="w-full text-sm font-medium text-muted-foreground sm:w-auto"
        >
          Total del período
        </h2>
        <p className="min-w-0 text-2xl font-semibold tracking-tight tabular-nums wrap-anywhere">
          {formatFinancialAmount(period.amount)}
        </p>
        <p className="text-sm text-muted-foreground">
          <InvoiceCount count={period.invoiceCount} />
        </p>
      </div>
      {groups.length ? (
        <>
          <Table
            aria-label="Facturación por grúa del período"
            className="table-fixed border-t"
          >
            <TableHeader className="bg-muted/70">
              <TableRow>
                <TableHead scope="col" className={nameCell}>
                  Grúa
                </TableHead>
                <TableHead scope="col" className={countCell}>
                  Facturas
                </TableHead>
                <TableHead scope="col" className={amountCell}>
                  Facturado con IVA
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const { category } = group
                const name =
                  category === 'assigned'
                    ? group.equipmentName
                    : category === 'none'
                      ? 'Sin equipo'
                      : reviewLabels[category]
                return (
                  <TableRow key={group.equipmentId ?? category}>
                    <th
                      scope="row"
                      className={`${nameCell} py-2 text-left font-medium`}
                    >
                      <div className="md:flex md:flex-wrap md:items-center md:gap-x-4">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0">{name}</span>
                          {group.active === false && (
                            <Badge variant="secondary">Inactiva</Badge>
                          )}
                        </div>
                        {(category === 'unknown' ||
                          category === 'unallocated') && (
                          <ReviewLink query={query} category={category} />
                        )}
                      </div>
                    </th>
                    <TableCell className={`${countCell} py-3 tabular-nums`}>
                      {group.invoiceCount.toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell className={`${amountCell} py-3 tabular-nums`}>
                      {formatFinancialAmount(group.amount)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">
            Una factura puede aparecer en más de un grupo. El total cuenta cada
            factura una vez.
          </p>
        </>
      ) : (
        <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
          No hay facturas con fecha en este período.
        </p>
      )}
    </section>
  )
}

export function UndatedInvoices({
  totals,
  query,
}: {
  totals: RevenueSummary['undated']
  query: EquipmentRevenueQuery
}) {
  return (
    <section
      aria-labelledby="equipment-revenue-undated"
      className="flex min-w-0 flex-wrap justify-between gap-x-8 gap-y-3 rounded-xl border bg-card px-4 py-4"
    >
      <div>
        <h2 id="equipment-revenue-undated" className="font-semibold">
          Facturas sin fecha
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fuera del período seleccionado.
        </p>
      </div>
      <div className="min-w-0 sm:text-right">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:justify-end">
          <p className="min-w-0 text-lg font-semibold tabular-nums wrap-anywhere">
            {formatFinancialAmount(totals.amount)}
          </p>
          <p className="text-sm text-muted-foreground">
            <InvoiceCount count={totals.invoiceCount} />
          </p>
        </div>
        {totals.invoiceCount > 0 && (
          <ReviewLink query={query} category="undated" />
        )}
      </div>
    </section>
  )
}

export function EquipmentRevenueReview({
  result,
  query,
}: {
  result: RevenueReview
  query: EquipmentRevenueQuery
}) {
  const { category, total, page, pageSize, invoices } = result
  return (
    <section aria-labelledby="equipment-revenue-review">
      <div className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-3">
        <h2 id="equipment-revenue-review" className="text-lg font-semibold">
          {reviewLabels[category]}
        </h2>
        <Link href={equipmentRevenueHref(query)} className={linkClass}>
          Volver al informe
        </Link>
      </div>
      {invoices.length ? (
        <>
          <Table
            aria-label={`Facturas para revisar · ${reviewLabels[category]}`}
            className="table-fixed border-t"
          >
            <TableHeader className="bg-muted/70">
              <TableRow>
                <TableHead
                  scope="col"
                  className="w-[40%] px-3 whitespace-normal md:w-auto md:px-4"
                >
                  Factura
                </TableHead>
                <TableHead
                  scope="col"
                  className="w-[23%] px-1 whitespace-normal md:w-40 md:px-4"
                >
                  Fecha
                </TableHead>
                <TableHead scope="col" className={`${amountCell} w-[37%]`}>
                  {category === 'undated'
                    ? 'Facturado con IVA'
                    : 'Importe por revisar'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <th
                    scope="row"
                    className="px-3 text-left font-medium whitespace-normal wrap-anywhere md:px-4"
                  >
                    <Link
                      href={`/documentos/${invoice.id}`}
                      className={linkClass}
                    >
                      {invoice.number || 'Factura sin número'}
                    </Link>
                  </th>
                  <TableCell className="px-1 whitespace-normal md:px-4">
                    {invoice.issuedOn ? (
                      <time dateTime={invoice.issuedOn}>
                        {invoice.issuedOn.split('-').reverse().join('/')}
                      </time>
                    ) : (
                      'Sin fecha'
                    )}
                  </TableCell>
                  <TableCell className={`${amountCell} tabular-nums`}>
                    {formatFinancialAmount(invoice.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationListing
            total={total}
            pagina={page}
            tamano={pageSize}
            href={(next) => equipmentRevenueHref(query, category, next)}
          />
        </>
      ) : (
        <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
          No hay facturas para revisar.
        </p>
      )}
    </section>
  )
}
