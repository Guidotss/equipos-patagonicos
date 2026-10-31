import type { Database } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type QuoteServiceClient = SupabaseClient<Database>

/** An error whose message can be shown to the user. */
export class ErrorQuote extends Error {}
