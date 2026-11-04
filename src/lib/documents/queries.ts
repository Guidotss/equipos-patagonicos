import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentContext } from './screens'

export async function contextoDocument(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<DocumentContext> {
  const [budgets, documents, invoices] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('id, numero, cliente_id, asunto, presupuesto_estado, equipo_id, cliente:clientes(razon_social)')
      .eq('cliente_id', clientId)
      .eq('estado', 'aprobada')
      .order('numero', { ascending: false }),
    supabase.from('documentos').select('*').eq('cliente_id', clientId).order('created_at', { ascending: false }),
    supabase.from('v_facturas').select('*').eq('cliente_id', clientId).order('fecha_vencimiento'),
  ])
  if (budgets.error) throw budgets.error
  if (documents.error) throw documents.error
  if (invoices.error) throw invoices.error
  const equipmentIds = [...new Set([
    ...budgets.data.map((budget) => budget.equipo_id),
    ...documents.data.map((document) => document.equipo_id),
  ].filter((id): id is string => id !== null))]
  // Incluye los equipos históricos inactivos vinculados a presupuestos o remitos del cliente.
  const equipment = equipmentIds.length
    ? await supabase.from('equipos').select('id, nombre').in('id', equipmentIds).order('nombre')
    : { data: [], error: null }
  if (equipment.error) throw equipment.error
  return {
    budgets: budgets.data.map((budget) => ({
      id: budget.id,
      numero: budget.numero,
      cliente_id: budget.cliente_id,
      cliente_razon_social: budget.cliente.razon_social,
      asunto: budget.asunto,
      presupuesto_estado: budget.presupuesto_estado ?? '',
      equipmentId: budget.equipo_id,
    })),
    documentos: documents.data,
    facturas: invoices.data,
    equipos: equipment.data,
  }
}
