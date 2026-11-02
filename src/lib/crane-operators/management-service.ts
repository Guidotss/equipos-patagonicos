import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { mapCraneOperatorRpcError } from './errors'
import { setCraneOperatorAccessSchema, type SetCraneOperatorAccessInput } from './management-schemas'

export async function setCraneOperatorAccess(
  supabase: SupabaseClient<Database>,
  input: SetCraneOperatorAccessInput,
): Promise<void> {
  const { userId, active, equipmentId } = setCraneOperatorAccessSchema.parse(input)
  const { error } = await supabase.rpc('set_crane_operator_access', {
    p_user_id: userId, p_active: active,
    ...(equipmentId === null ? {} : { p_equipment_id: equipmentId }),
  })
  if (error) throw mapCraneOperatorRpcError(error)
}
