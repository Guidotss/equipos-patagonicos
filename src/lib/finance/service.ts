import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type {
  FinanceInput,
  PaymentStatusAction,
  DocumentLifecycleAction,
} from './contracts'

export function financialDocumentData(
  data: Json,
  finance?: FinanceInput,
  paymentCondition?: string,
): Json {
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Documento inválido')
  return {
    ...data,
    ...(finance !== undefined ? { finance } : {}),
    ...(paymentCondition !== undefined
      ? { payment_condition: paymentCondition }
      : {}),
  }
}

export async function changePaymentStatus(
  supabase: SupabaseClient<Database>,
  input: PaymentStatusAction,
) {
  const { data, error } = await supabase.rpc(
    'change_payment_instrument_status',
    {
      p_op_id: input.opId,
      p_instrument_id: input.instrumentId,
      p_expected_version: input.expectedVersion,
      p_status: input.status,
      p_settled_on: input.settledOn ?? undefined,
      p_reason: input.correctionReason,
    },
  )
  if (error) throw error
  return data
}

export async function changeDocumentLifecycle(
  supabase: SupabaseClient<Database>,
  input: DocumentLifecycleAction,
) {
  const { error } = await supabase.rpc(
    input.restore ? 'restaurar_documento' : 'anular_documento',
    {
      p_id: input.id,
      p_expected_version: input.expectedVersion,
      p_reason: input.correctionReason,
    },
  )
  if (error) throw error
}
