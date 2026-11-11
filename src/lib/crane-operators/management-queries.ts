import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import type { Page } from './contracts'
import { mapCraneOperatorRpcError } from './errors'
import type { ManagedCraneOperator } from './management-contracts'
import { craneOperatorFiltersSchema, type CraneOperatorFilters } from './management-schemas'

type Client = SupabaseClient<Database>
type RpcRow = Database['public']['Functions']['list_crane_operators']['Returns'][number]
// El agregado sin remitos devuelve null aunque el tipo generado indique lo contrario.
type ManagedOperatorRow = Omit<RpcRow, 'last_submission_at'> & { last_submission_at: string | null }

function readOperator(row: ManagedOperatorRow): ManagedCraneOperator {
  return {
    userId: row.user_id, name: row.name, email: row.email, active: row.active,
    noteCount: row.note_count, pendingNoteCount: row.pending_note_count, lastSubmissionAt: row.last_submission_at,
  }
}

export async function listCraneOperators(
  supabase: Client,
  input: CraneOperatorFilters = {},
): Promise<Page<{ operators: ManagedCraneOperator[] }>> {
  const { q, active, page, pageSize } = craneOperatorFiltersSchema.parse(input)
  const start = (page - 1) * pageSize
  const { data, count, error } = await supabase.rpc('list_crane_operators', {
    p_search: q, ...(active === 'all' ? {} : { p_active: active === 'active' }),
  }, { count: 'exact' }).order('name').order('user_id').range(start, start + pageSize - 1)
  if (error?.code === 'PGRST103' && page > 1) {
    return listCraneOperators(supabase, { q, active, page: 1, pageSize })
  }
  if (error) throw mapCraneOperatorRpcError(error)
  const total = count ?? 0
  const validPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)))
  if (validPage !== page) return listCraneOperators(supabase, { q, active, page: validPage, pageSize })
  return { operators: (data ?? []).map(readOperator), total, page, pageSize }
}

/** La RPC solo devuelve gruistas, incluso si el identificador pertenece a otro rol. */
export async function getManagedCraneOperator(supabase: Client, id: string): Promise<ManagedCraneOperator | null> {
  const userId = z.uuid().parse(id)
  const { data, error } = await supabase.rpc('list_crane_operators').eq('user_id', userId).maybeSingle()
  if (error) throw mapCraneOperatorRpcError(error)
  return data ? readOperator(data) : null
}
