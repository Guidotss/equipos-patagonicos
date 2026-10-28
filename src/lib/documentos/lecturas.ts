import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ContextoDocumento, OpcionPresupuesto } from './pantallas'

export async function contextoDocumento(
  supabase: SupabaseClient<Database>,
  clienteId: string,
): Promise<ContextoDocumento> {
  const [presupuestos, documentos, facturas, equipos] = await Promise.all([
    supabase
      .from('v_presupuestos')
      .select('id, numero, cliente_id, cliente_razon_social, asunto, presupuesto_estado')
      .eq('cliente_id', clienteId)
      .order('numero', { ascending: false }),
    supabase.from('documentos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
    supabase.from('v_facturas').select('*').eq('cliente_id', clienteId).order('fecha_vencimiento'),
    supabase.from('equipos').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  for (const resultado of [presupuestos, documentos, facturas, equipos]) if (resultado.error) throw resultado.error
  return {
    presupuestos: presupuestos.data as OpcionPresupuesto[],
    documentos: documentos.data!,
    facturas: facturas.data!,
    equipos: equipos.data!,
  }
}
