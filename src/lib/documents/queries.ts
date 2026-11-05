import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { readAllPages, readFinanceByDocument } from '@/lib/finance/queries'
import type { FinanceByDocument } from '@/lib/finance/contracts'
import type { DocumentContext } from './screens'

export async function contextoDocument(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<DocumentContext> {
  const [budgets, documents, invoices] = await Promise.all([
    readAllPages((from, to) => supabase
      .from('cotizaciones')
      .select('id, numero, cliente_id, asunto, presupuesto_estado, equipo_id, cliente:clientes(razon_social)')
      .eq('cliente_id', clientId)
      .eq('estado', 'aprobada')
      .order('numero', { ascending: false }).order('id').range(from, to)),
    readAllPages((from, to) => supabase.from('documentos').select('*').eq('cliente_id', clientId)
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages((from, to) => supabase.from('v_facturas').select('*, exact_balance:saldo::text').eq('cliente_id', clientId)
      .order('fecha_vencimiento').order('id').range(from, to)),
  ])
  const financeByDocument: FinanceByDocument = Object.fromEntries(documents.map((document) => [document.id, {
    invoiceAllocations: [], paymentInstruments: [], paymentAllocations: [],
  }]))
  Object.assign(financeByDocument, await readFinanceByDocument(supabase, documents
    .filter((document) => document.tipo === 'factura' || document.tipo === 'orden_pago').map((document) => document.id)))
  const equipmentIds = [...new Set([
    ...Object.values(financeByDocument).flatMap((finance) => finance.invoiceAllocations.map((allocation) => allocation.equipmentId)),
    ...budgets.map((budget) => budget.equipo_id),
    ...documents.map((document) => document.equipo_id),
  ].filter((id): id is string => id !== null))]
  // Incluye los equipos históricos inactivos vinculados a presupuestos o remitos del cliente.
  const equipment: { id: string; nombre: string }[] = []
  for (let index = 0; index < equipmentIds.length; index += 100) {
    const batch = equipmentIds.slice(index, index + 100)
    equipment.push(...await readAllPages((from, to) => supabase.from('equipos').select('id, nombre')
      .in('id', batch).order('nombre').order('id').range(from, to)))
  }
  equipment.sort((first, second) => first.nombre.localeCompare(second.nombre, 'es'))
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
    equipos: equipment,
    financeByDocument,
  }
}
