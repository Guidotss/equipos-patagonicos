import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { readAllPages, readFinanceByDocument } from '@/lib/finance/queries'
import type { FinanceByDocument } from '@/lib/finance/contracts'
import type { DocumentContext } from './screens'

export async function contextoDocument(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<DocumentContext> {
  const [budgets, documentsWithBudgets, invoices, equipment] =
    await Promise.all([
      readAllPages((from, to) =>
        supabase
          .from('cotizaciones')
          .select(
            'id, numero, cliente_id, asunto, presupuesto_estado, equipo_id, cliente:clientes(razon_social)',
          )
          .eq('cliente_id', clientId)
          .eq('estado', 'aprobada')
          .order('numero', { ascending: false })
          .order('id')
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from('documentos')
          .select('*, documento_presupuestos(cotizacion_id)')
          .eq('cliente_id', clientId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from('v_facturas')
          .select(
            '*, exact_balance:saldo::text, exact_available:available_amount::text',
          )
          .eq('cliente_id', clientId)
          .order('fecha_vencimiento')
          .order('id')
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from('equipos')
          .select('id, nombre, activo')
          .order('nombre')
          .order('id')
          .range(from, to),
      ),
    ])
  const invoiceBudgetIds: DocumentContext['invoiceBudgetIds'] = {}
  const documents = documentsWithBudgets.map(
    ({ documento_presupuestos: links, ...document }) => {
      if (document.tipo === 'factura')
        invoiceBudgetIds[document.id] = links.map((link) => link.cotizacion_id)
      return document
    },
  )
  const financeByDocument: FinanceByDocument = Object.fromEntries(
    documents.map((document) => [
      document.id,
      {
        invoiceAllocations: [],
        paymentInstruments: [],
        paymentAllocations: [],
      },
    ]),
  )
  Object.assign(
    financeByDocument,
    await readFinanceByDocument(
      supabase,
      documents
        .filter(
          (document) =>
            document.tipo === 'factura' || document.tipo === 'orden_pago',
        )
        .map((document) => document.id),
    ),
  )
  return {
    budgets: budgets.map((budget) => ({
      id: budget.id,
      numero: budget.numero,
      cliente_id: budget.cliente_id,
      cliente_razon_social: budget.cliente.razon_social,
      asunto: budget.asunto,
      presupuesto_estado: budget.presupuesto_estado ?? '',
      equipmentId: budget.equipo_id,
    })),
    documentos: documents,
    facturas: invoices,
    invoiceBudgetIds,
    equipos: equipment,
    financeByDocument,
  }
}
