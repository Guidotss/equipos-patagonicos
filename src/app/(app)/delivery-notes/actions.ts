'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { craneActionFailure } from '@/lib/crane-operators/action-result'
import type { LinkableBudget, Page } from '@/lib/crane-operators/contracts'
import { listLinkableBudgets } from '@/lib/crane-operators/queries'
import {
  linkCraneDeliveryNoteSchema,
  paginationSchema,
} from '@/lib/crane-operators/schemas'
import { linkCraneDeliveryNote } from '@/lib/crane-operators/service'
import { errorsByPath } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'

export async function readLinkableBudgets(
  input: unknown,
): Promise<Result<Page<{ budgets: LinkableBudget[] }>>> {
  await requireStaff()
  const parsed = paginationSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, message: 'La página de presupuestos no es válida.' }
  try {
    return {
      ok: true,
      datos: await listLinkableBudgets(await createClient(), parsed.data),
    }
  } catch (error) {
    return craneActionFailure(error)
  }
}

export async function linkDeliveryNote(
  input: unknown,
): Promise<Result<{ documentId: string }>> {
  await requireStaff()
  const parsed = linkCraneDeliveryNoteSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: 'Elegí un presupuesto para vincular el remito.',
      errors: errorsByPath(parsed.error),
    }
  try {
    const documentId = await linkCraneDeliveryNote(
      await createClient(),
      parsed.data,
    )
    revalidatePath('/delivery-notes', 'layout')
    revalidatePath('/operator', 'layout')
    revalidatePath('/presupuestos', 'layout')
    revalidatePath(`/presupuestos/${parsed.data.budgetId}`)
    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/')
    return { ok: true, datos: { documentId } }
  } catch (error) {
    return craneActionFailure(error)
  }
}
