'use server'

import { revalidatePath } from 'next/cache'
import { requireCraneOperator } from '@/lib/auth'
import { craneActionFailure } from '@/lib/crane-operators/action-result'
import { craneDeliveryNoteSubmissionSchema, craneDeliveryNoteUploadSchema } from '@/lib/crane-operators/schemas'
import { prepareCraneDeliveryNoteUpload, submitCraneDeliveryNote } from '@/lib/crane-operators/service'
import { errorsByPath } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'

export async function prepareOperatorUpload(input: unknown): Promise<Result<{ path: string; signedUrl: string }>> {
  await requireCraneOperator()
  const parsed = craneDeliveryNoteUploadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Revisá el tipo y el tamaño del archivo (máximo 10 MB).' }
  try {
    const { path, signedUrl } = await prepareCraneDeliveryNoteUpload(await createClient(), parsed.data)
    return { ok: true, datos: { path, signedUrl } }
  } catch (error) {
    return craneActionFailure(error)
  }
}

export async function sendOperatorNote(input: unknown): Promise<Result<{ id: string }>> {
  await requireCraneOperator()
  const parsed = craneDeliveryNoteSubmissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Revisá los datos marcados', errors: errorsByPath(parsed.error) }
  try {
    const id = await submitCraneDeliveryNote(await createClient(), parsed.data)
    revalidatePath('/operator', 'layout')
    revalidatePath('/delivery-notes', 'layout')
    revalidatePath('/presupuestos', 'layout')
    return { ok: true, datos: { id } }
  } catch (error) {
    return craneActionFailure(error)
  }
}
