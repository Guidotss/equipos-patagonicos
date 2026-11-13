import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { PER_PAGE, type FiltersBudgets } from './list'

export function searchBudgets(
  supabase: SupabaseClient<Database>,
  filters: FiltersBudgets,
) {
  const from = (filters.pagina - 1) * PER_PAGE
  return supabase
    .rpc(
      'buscar_presupuestos',
      {
        texto: filters.q,
        estado: filters.estado,
        cliente: filters.cliente || undefined,
      },
      { count: 'exact' },
    )
    .select('*, exact_balance:saldo::text')
    .order('numero', { ascending: false })
    .range(from, from + PER_PAGE - 1)
}
