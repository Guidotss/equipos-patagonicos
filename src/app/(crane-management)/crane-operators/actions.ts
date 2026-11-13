'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { CraneOperatorError } from '@/lib/crane-operators/errors'
import {
  newCraneOperatorSchema,
  setCraneOperatorAccessSchema,
} from '@/lib/crane-operators/management-schemas'
import { setCraneOperatorAccess } from '@/lib/crane-operators/management-service'
import {
  provisionCraneOperator,
  type NewCraneOperatorResult,
} from '@/lib/crane-operators/provisioning'
import { errorsByPath } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'

function managementFailure(error: unknown): Result<never> {
  unstable_rethrow(error)
  if (error instanceof CraneOperatorError)
    return { ok: false, message: error.message }
  console.error('No se pudo completar la gestión del gruista.')
  return {
    ok: false,
    message:
      'No se pudo completar la operación. Reintentá sin perder los datos.',
  }
}

function revalidateManagement(userId: string) {
  revalidatePath('/crane-operators')
  revalidatePath(`/crane-operators/${userId}`)
  revalidatePath('/configuracion/users')
  revalidatePath('/operator', 'layout')
}

export async function createStaffCraneOperator(
  input: unknown,
): Promise<Result<NewCraneOperatorResult>> {
  const user = await requireStaff()
  const parsed = newCraneOperatorSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: 'Revisá los datos del gruista.',
      errors: errorsByPath(parsed.error),
    }
  try {
    const result = await provisionCraneOperator({
      actorId: user.id,
      input: parsed.data,
    })
    revalidateManagement(result.userId)
    return { ok: true, datos: result }
  } catch (error) {
    return managementFailure(error)
  }
}

export async function updateStaffCraneOperatorAccess(
  input: unknown,
): Promise<Result> {
  await requireStaff()
  const parsed = setCraneOperatorAccessSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: 'Revisá el acceso del gruista.',
      errors: errorsByPath(parsed.error),
    }
  try {
    await setCraneOperatorAccess(await createClient(), parsed.data)
    revalidateManagement(parsed.data.userId)
    return { ok: true, datos: null }
  } catch (error) {
    return managementFailure(error)
  }
}
