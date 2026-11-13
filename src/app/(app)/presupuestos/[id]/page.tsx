import { requireStaff } from '@/lib/auth'
import { FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarCrumbs, Content, HeaderFicha } from '@/components/app-shell/header'
import { DocumentForm } from '@/components/documents/document-form'
import { ActionsBudget } from '@/components/budgets/actions-budget'
import { BudgetStatus } from '@/components/budgets/budget-status'
import { SectionsDocuments } from '@/components/budgets/sections-documents'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/schemas'
import { contextoDocument } from '@/lib/documents/queries'
import { FinancialSummary } from '@/components/budgets/financial-summary'
import { unresolvedDocuments } from '@/lib/finance/unresolved-documents'
import { historicalAdvances } from '@/lib/finance/historical-advances'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'
import { withBudgetSubjects } from '@/lib/budgets/subjects'

export const metadata: Metadata = { title: 'Presupuesto' }
export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireStaff()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const consulta = await searchParams
  const supabase = await createClient()
  const { data: budget, error } = await supabase
    .from('v_presupuestos')
    .select(
      '*, exact_balance:saldo::text, exact_billed:facturado::text, exact_credited:credited_money::text, exact_withheld:withheld_amount::text, exact_legacy:legacy_settled_amount::text, exact_advances:unapplied_advances::text, exact_pending:pending_check_amount::text',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!budget) notFound()
  const [contexto, vinculos, [displayBudget]] = await Promise.all([
    contextoDocument(supabase, budget.cliente_id),
    supabase
      .from('documento_presupuestos')
      .select('documento_id')
      .eq('cotizacion_id', id),
    withBudgetSubjects(supabase, [budget]),
  ])
  if (vinculos.error) throw vinculos.error
  const ids = vinculos.data.map((item) => item.documento_id)
  const documentos = contexto.documentos.filter((item) => ids.includes(item.id))
  const [archivos, aplicaciones] = ids.length
    ? await Promise.all([
        supabase
          .from('documento_archivos')
          .select('*')
          .in('documento_id', ids)
          .order('orden'),
        supabase.from('op_facturas').select('*').in('op_id', ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (archivos.error) throw archivos.error
  if (aplicaciones.error) throw aplicaciones.error
  const nuevo =
    typeof consulta.nuevo === 'string' &&
    Object.hasOwn(DOCUMENT_TYPES, consulta.nuevo)
      ? (consulta.nuevo as DocumentType)
      : null
  const deliveryNoteId =
    typeof consulta.remito === 'string' && isUuid(consulta.remito)
      ? consulta.remito
      : undefined
  const invoiceId =
    typeof consulta.factura === 'string' && isUuid(consulta.factura)
      ? consulta.factura
      : undefined
  const indicadores = [
    ['orden de compra', 'órdenes de compra', budget.ordenes_compra],
    ['remito', 'remitos', budget.remitos],
    ['factura', 'facturas', budget.facturas],
    ['orden de pago', 'órdenes de pago', budget.ordenes_pago],
  ] as const
  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Presupuestos', href: '/presupuestos' },
          { texto: String(budget.numero) },
        ]}
      />
      <HeaderFicha
        titulo={`Presupuesto N° ${budget.numero}`}
        recuadro={<FileText className="size-10 text-primary" />}
        estado={
          <BudgetStatus
            status={budget.display_status}
            invoices={budget.facturas}
            paymentOrders={budget.ordenes_pago}
          />
        }
        datos={
          <>
            <Link
              href={`/clientes/${budget.cliente_id}`}
              className="hover:underline"
            >
              {budget.cliente_razon_social}
            </Link>
            <span className="mx-2">·</span>
            {displayBudget.displaySubject || 'Sin trabajo indicado'}
          </>
        }
        actions={
          <ActionsBudget
            id={id}
            status={budget.presupuesto_estado}
            paidInFull={budget.paid_in_full === true}
          />
        }
      />
      <Content>
        {budget.presupuesto_motivo ? (
          <Alert>
            <AlertDescription>
              Motivo de anulación: {budget.presupuesto_motivo}
            </AlertDescription>
          </Alert>
        ) : null}
        <FinancialSummary
          billed={budget.exact_billed}
          credited={budget.exact_credited}
          withheld={budget.exact_withheld}
          legacy={budget.exact_legacy}
          advances={budget.exact_advances}
          pendingChecks={budget.exact_pending}
          balance={budget.exact_balance}
          documents={unresolvedDocuments(documentos, contexto)}
          historicalAdvances={historicalAdvances(contexto, id)}
        />
        <p className="text-sm text-muted-foreground">
          {indicadores
            .map(
              ([singular, plural, value]) =>
                `${value ?? 0} ${value === 1 ? singular : plural}`,
            )
            .join(' · ')}
        </p>
        {nuevo && budget.presupuesto_estado !== 'anulado' ? (
          <DocumentForm
            key={`${nuevo}-${deliveryNoteId}-${invoiceId}`}
            budgetId={id}
            options={contexto.budgets}
            initialContext={contexto}
            type={nuevo}
            deliveryNoteId={deliveryNoteId}
            invoiceId={invoiceId}
          />
        ) : null}
        <SectionsDocuments
          budgetId={id}
          documentos={documentos}
          archivos={archivos.data!}
          facturas={contexto.facturas}
          anulados={budget.presupuesto_estado === 'anulado'}
          aplicaciones={aplicaciones.data!}
        />
        <div className="flex justify-between gap-4 text-sm">
          <Link
            href={`/cotizaciones/${id}`}
            className="text-primary hover:underline"
          >
            Ver{' '}
            {budget.origen === 'directa'
              ? 'presupuesto original'
              : 'cotización original'}
          </Link>
          <Link
            href="/presupuestos"
            className="text-muted-foreground hover:underline"
          >
            Volver a presupuestos
          </Link>
        </div>
      </Content>
    </>
  )
}
