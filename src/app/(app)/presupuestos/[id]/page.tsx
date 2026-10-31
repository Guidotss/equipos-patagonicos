import { FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarCrumbs, Content, HeaderFicha } from '@/components/app-shell/header'
import { DocumentForm } from '@/components/documents/document-form'
import { ActionsBudget } from '@/components/budgets/actions-budget'
import { SectionsDocuments } from '@/components/budgets/sections-documents'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Pill } from '@/components/ui/pill'
import { TIPOS_DOCUMENT, type TipoDocument } from '@/lib/documents/schemas'
import { contextoDocument } from '@/lib/documents/queries'
import { formatMoneda } from '@/lib/format/amounts'
import { STATUSES_BUDGET } from '@/lib/budgets/list'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const metadata: Metadata = { title: 'Presupuesto' }
export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const consulta = await searchParams
  const supabase = await createClient()
  const { data: budget, error } = await supabase.from('v_presupuestos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!budget) notFound()
  const [contexto, vinculos] = await Promise.all([
    contextoDocument(supabase, budget.cliente_id),
    supabase.from('documento_presupuestos').select('documento_id').eq('cotizacion_id', id),
  ])
  if (vinculos.error) throw vinculos.error
  const ids = vinculos.data.map((item) => item.documento_id)
  const documentos = contexto.documentos.filter((item) => ids.includes(item.id))
  const [archivos, aplicaciones] = ids.length
    ? await Promise.all([
        supabase.from('documento_archivos').select('*').in('documento_id', ids).order('orden'),
        supabase.from('op_facturas').select('*').in('op_id', ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (archivos.error) throw archivos.error
  if (aplicaciones.error) throw aplicaciones.error
  const nuevo =
    typeof consulta.nuevo === 'string' && Object.hasOwn(TIPOS_DOCUMENT, consulta.nuevo)
      ? (consulta.nuevo as TipoDocument)
      : null
  const deliveryNoteId = typeof consulta.remito === 'string' && isUuid(consulta.remito) ? consulta.remito : undefined
  const invoiceId = typeof consulta.factura === 'string' && isUuid(consulta.factura) ? consulta.factura : undefined
  const indicadores = [
    ['OC', budget.ordenes_compra],
    ['Remitos', budget.remitos],
    ['Facturas', budget.facturas],
    ['OP', budget.ordenes_pago],
  ] as const
  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Presupuestos', href: '/presupuestos' }, { texto: String(budget.numero) }]} />
      <HeaderFicha
        titulo={`Presupuesto N° ${budget.numero}`}
        recuadro={<FileText className="size-10 text-primary" />}
        estado={
          <Pill
            tone={
              budget.presupuesto_estado === 'en_curso'
                ? 'info'
                : budget.presupuesto_estado === 'finalizado'
                  ? 'exito'
                  : 'neutro'
            }
          >
            {STATUSES_BUDGET[budget.presupuesto_estado as keyof typeof STATUSES_BUDGET]}
          </Pill>
        }
        datos={
          <>
            <Link href={`/clientes/${budget.cliente_id}`} className="hover:underline">
              {budget.cliente_razon_social}
            </Link>
            <span className="mx-2">·</span>
            {budget.asunto}
          </>
        }
        actions={<ActionsBudget id={id} estado={budget.presupuesto_estado} />}
      />
      <Content>
        {budget.presupuesto_motivo ? (
          <Alert>
            <AlertDescription>Motivo de anulación: {budget.presupuesto_motivo}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.6fr]">
          {indicadores.map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card px-4 py-3 shadow-tarjeta">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-xl border bg-card px-4 py-3 shadow-tarjeta sm:col-span-4 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Saldo a cobrar</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="saldo-presupuesto">
              {formatMoneda(budget.saldo ?? 0)}
            </p>
          </div>
        </div>
        {nuevo && budget.presupuesto_estado !== 'anulado' ? (
          <DocumentForm
            key={`${nuevo}-${deliveryNoteId}-${invoiceId}`}
            budgetId={id}
            options={contexto.budgets}
            contextoInitial={contexto}
            tipo={nuevo}
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
          <Link href={`/cotizaciones/${id}`} className="text-primary hover:underline">
            Ver {budget.origen === 'directa' ? 'presupuesto original' : 'cotización original'}
          </Link>
          <Link href="/presupuestos" className="text-muted-foreground hover:underline">
            Volver a presupuestos
          </Link>
        </div>
      </Content>
    </>
  )
}
