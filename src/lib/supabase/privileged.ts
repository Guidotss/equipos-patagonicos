import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

export function createPrivilegedClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!secretKey)
    throw new Error(
      'La creación de gruistas no está configurada en el servidor',
    )
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
