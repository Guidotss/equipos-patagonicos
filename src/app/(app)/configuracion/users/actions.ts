'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { craneActionFailure } from '@/lib/crane-operators/action-result'
import { setUserAccessSchema } from '@/lib/crane-operators/schemas'
import { setUserAccess } from '@/lib/crane-operators/service'
import { errorsByPath } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'

export async function updateUserAccess(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = setUserAccessSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: 'Revisá el acceso del usuario.',
      errors: errorsByPath(parsed.error),
    }
  try {
    await setUserAccess(await createClient(), parsed.data)
    revalidatePath('/configuracion/users')
    revalidatePath('/operator', 'layout')
    return { ok: true, datos: null }
  } catch (error) {
    return craneActionFailure(error)
  }
}
