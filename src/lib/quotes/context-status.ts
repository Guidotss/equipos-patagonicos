// src/lib/cotizaciones/contexto-estado.ts
// Lo que el editor necesita saber del estado de una cotización guardada y que no está en EstadoEditor:
// los envíos, el vencimiento, la fecha de aprobación y la cotización que reemplaza.
// Recibe el cliente de Supabase por parámetro (no importar 'server-only': lo carga Vitest).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type ContextoStatus = {
  /** Envíos de la cotización, el más reciente primero. */
  envios: { id: string; enviada_at: string }[]
  /** Enviada y fuera de validez (v_cotizaciones.vencida). */
  vencida: boolean
  /** fecha + validez_dias ('YYYY-MM-DD'). */
  venceEl: string | null
  /** 'YYYY-MM-DD', solo en aprobadas. */
  dateApproval: string | null
  /** La cotización que esta reemplaza (reemplaza_a): la de la que se duplicó para renegociar. */
  anterior: { id: string; numero: number } | null
}

/** El de una cotización que todavía no se guardó. */
export const CONTEXTO_NEW: ContextoStatus = { envios: [], vencida: false, venceEl: null, dateApproval: null, anterior: null }

/** null si la cotización no existe (o la RLS no la deja ver). */
export async function readContextoStatus(supabase: SupabaseClient<Database>, id: string): Promise<ContextoStatus | null> {
  const [row, sends] = await Promise.all([
    supabase.from('v_cotizaciones').select('vencida, vence_el, fecha_aprobacion, reemplaza_a').eq('id', id).maybeSingle(),
    supabase
      .from('cotizacion_envios')
      .select('id, enviada_at')
      .eq('cotizacion_id', id)
      .order('enviada_at', { ascending: false }),
  ])
  if (row.error) throw row.error
  if (sends.error) throw sends.error
  if (!row.data) return null

  let previous: ContextoStatus['anterior'] = null
  if (row.data.reemplaza_a) {
    const { data, error } = await supabase.from('cotizaciones').select('id, numero').eq('id', row.data.reemplaza_a).maybeSingle()
    if (error) throw error
    previous = data
  }

  return {
    envios: sends.data,
    vencida: row.data.vencida ?? false,
    venceEl: row.data.vence_el,
    dateApproval: row.data.fecha_aprobacion,
    anterior: previous,
  }
}
