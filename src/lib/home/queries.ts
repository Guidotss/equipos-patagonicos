import 'server-only'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { QueueHome } from './model'

export type PendingHome = Database['public']['Views']['v_inicio_colas']['Row']
export type ResumenHome = Database['public']['Functions']['inicio_resumen']['Returns'][number]
export const PENDING_PER_PAGE = 25

export async function readHome(cola?: QueueHome, pagina = 1) {
  const supabase = await createClient()
  const [resumen, pendingList] = await Promise.all([
    supabase.rpc('inicio_resumen'),
    supabase.rpc('inicio_pendientes', {
      p_cola: cola,
      p_limite: cola ? PENDING_PER_PAGE : 3,
      p_desde: cola ? (pagina - 1) * PENDING_PER_PAGE : 0,
    }),
  ])
  if (resumen.error) throw resumen.error
  if (pendingList.error) throw pendingList.error
  return { resumen: resumen.data, pendingList: pendingList.data }
}
