import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import {
  EquipmentRevenueReport, EquipmentRevenueReview, EquipmentRevenueSummary, UndatedInvoices,
} from '@/components/reports/equipment-revenue-report'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireStaff } from '@/lib/auth'
import {
  equipmentRevenueHref, readEquipmentRevenue, readEquipmentRevenueQuery, type EquipmentRevenueQuery,
} from '@/lib/finance/report'
import { createClient } from '@/lib/supabase/server'

const title = 'Facturación por grúa'
export const metadata: Metadata = { title }

type ReportRequest = Promise<Awaited<ReturnType<typeof readEquipmentRevenue>> | null>

export default async function EquipmentRevenuePage({ searchParams }: PageProps<'/reports/equipment-revenue'>) {
  await requireStaff()
  const query = readEquipmentRevenueQuery(await searchParams)
  const report = query.error ? null : loadReport(query)
  const requestKey = equipmentRevenueHref(query, query.review, query.page)
  return (
    <>
      <BarCrumbs crumbs={[{ texto: title }]} />
      <Content>
        <HeaderPage compact titulo={title} descripcion="Importes con IVA según la fecha de factura." />
        <EquipmentRevenueReport query={query}>
          {report && (
            <Suspense key={requestKey} fallback={
              <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando facturación…</p>
            }>
              <EquipmentRevenueResults query={query} report={report} />
            </Suspense>
          )}
        </EquipmentRevenueReport>
        {report && !query.review && (
          <Suspense key={requestKey} fallback={null}>
            <EquipmentRevenueUndated query={query} report={report} />
          </Suspense>
        )}
      </Content>
    </>
  )
}

async function loadReport(query: EquipmentRevenueQuery): ReportRequest {
  try {
    return await readEquipmentRevenue(await createClient(), query)
  } catch {
    return null
  }
}

async function EquipmentRevenueResults({ query, report }: { query: EquipmentRevenueQuery; report: ReportRequest }) {
  const result = await report
  if (!result) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la facturación. Volvé a aplicar los filtros para reintentar.</AlertDescription>
        </Alert>
      </div>
    )
  }
  return result.kind === 'review'
    ? <EquipmentRevenueReview result={result} query={query} />
    : <EquipmentRevenueSummary summary={result} query={query} />
}

async function EquipmentRevenueUndated({ query, report }: { query: EquipmentRevenueQuery; report: ReportRequest }) {
  const result = await report
  return result?.kind === 'summary' ? <UndatedInvoices totals={result.undated} query={query} /> : null
}
