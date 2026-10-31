import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentContext, OptionBudget } from './screens'

export async function contextoDocument(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<DocumentContext> {
  const [budgets, documentos, facturas, equipos] = await Promise.all([
    supabase
      .from('v_presupuestos')
      .select('id, numero, cliente_id, cliente_razon_social, asunto, presupuesto_estado')
      .eq('cliente_id', clientId)
      .order('numero', { ascending: false }),
    supabase.from('documentos').select('*').eq('cliente_id', clientId).order('created_at', { ascending: false }),
    supabase.from('v_facturas').select('*').eq('cliente_id', clientId).order('fecha_vencimiento'),
    supabase.from('equipos').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  for (const result of [budgets, documentos, facturas, equipos]) if (result.error) throw result.error
  return {
    budgets: budgets.data as OptionBudget[],
    documentos: documentos.data!,
    facturas: facturas.data!,
    equipos: equipos.data!,
  }
}
