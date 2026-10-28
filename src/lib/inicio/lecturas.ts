import 'server-only'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { ColaInicio } from './modelo'

export type PendienteInicio = Database['public']['Views']['v_inicio_colas']['Row']
export type ResumenInicio = Database['public']['Functions']['inicio_resumen']['Returns'][number]
export const PENDIENTES_POR_PAGINA = 25

export async function leerInicio(cola?: ColaInicio, pagina = 1) {
  const supabase = await createClient()
  const [resumen, pendientes] = await Promise.all([
    supabase.rpc('inicio_resumen'),
    supabase.rpc('inicio_pendientes', {
      p_cola: cola,
      p_limite: cola ? PENDIENTES_POR_PAGINA : 3,
      p_desde: cola ? (pagina - 1) * PENDIENTES_POR_PAGINA : 0,
    }),
  ])
  if (resumen.error) throw resumen.error
  if (pendientes.error) throw pendientes.error
  return { resumen: resumen.data, pendientes: pendientes.data }
}
