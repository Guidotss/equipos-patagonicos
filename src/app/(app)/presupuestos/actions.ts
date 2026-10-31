'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { messageErrorBase } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'

export async function changeStatusBudget(entrada: unknown): Promise<Result> {
  await requireUser()
  const datos = z
    .object({
      id: z.uuid(),
      estado: z.enum(['en_curso', 'finalizado', 'anulado']),
      motivo: z.string().trim().max(2000),
    })
    .safeParse(entrada)
  if (!datos.success) return { ok: false, message: 'Revisá el estado y el motivo (máximo 2000 caracteres).' }
  const { error } = await (
    await createClient()
  ).rpc('cambiar_estado_presupuesto', { p_id: datos.data.id, p_estado: datos.data.estado, p_motivo: datos.data.motivo })
  if (error) return { ok: false, message: messageErrorBase(error) }
  revalidatePath('/presupuestos', 'layout')
  revalidatePath('/')
  return { ok: true, datos: null }
}
