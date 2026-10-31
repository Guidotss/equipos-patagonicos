import type { Database } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type QuoteServiceClient = SupabaseClient<Database>

/** Error cuyo mensaje se puede mostrar al usuario. */
export class ErrorQuote extends Error {}
