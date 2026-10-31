// src/lib/cotizaciones/contexto-estado.ts
// Lo que el editor necesita saber del estado de una cotización guardada y que no está en EstadoEditor:
// los envíos, el vencimiento, la fecha de aprobación y la cotización que reemplaza.
// Recibe el cliente de Supabase por parámetro (no importar 'server-only': lo carga Vitest).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type ContextoEstado = {
  /** Envíos de la cotización, el más reciente primero. */
  envios: { id: string; enviada_at: string }[]
  /** Enviada y fuera de validez (v_cotizaciones.vencida). */
  vencida: boolean
  /** fecha + validez_dias ('YYYY-MM-DD'). */
  venceEl: string | null
  /** 'YYYY-MM-DD', solo en aprobadas. */
  fechaAprobacion: string | null
  /** La cotización que esta reemplaza (reemplaza_a): la de la que se duplicó para renegociar. */
  anterior: { id: string; numero: number } | null
}

/** El de una cotización que todavía no se guardó. */
export const CONTEXTO_NUEVA: ContextoEstado = { envios: [], vencida: false, venceEl: null, fechaAprobacion: null, anterior: null }

/** null si la cotización no existe (o la RLS no la deja ver). */
export async function leerContextoEstado(supabase: SupabaseClient<Database>, id: string): Promise<ContextoEstado | null> {
  const [fila, envios] = await Promise.all([
    supabase.from('v_cotizaciones').select('vencida, vence_el, fecha_aprobacion, reemplaza_a').eq('id', id).maybeSingle(),
    supabase
      .from('cotizacion_envios')
      .select('id, enviada_at')
      .eq('cotizacion_id', id)
      .order('enviada_at', { ascending: false }),
  ])
  if (fila.error) throw fila.error
  if (envios.error) throw envios.error
  if (!fila.data) return null

  let anterior: ContextoEstado['anterior'] = null
  if (fila.data.reemplaza_a) {
    const { data, error } = await supabase.from('cotizaciones').select('id, numero').eq('id', fila.data.reemplaza_a).maybeSingle()
    if (error) throw error
    anterior = data
  }

  return {
    envios: envios.data,
    vencida: fila.data.vencida ?? false,
    venceEl: fila.data.vence_el,
    fechaAprobacion: fila.data.fecha_aprobacion,
    anterior,
  }
}
