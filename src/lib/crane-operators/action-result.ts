import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import type { Result } from '@/lib/result'
import { CraneOperatorError } from './service'

export function craneActionFailure(error: unknown): Result<never> {
  unstable_rethrow(error)
  if (error instanceof CraneOperatorError) return { ok: false, message: error.message }
  console.error(error)
  return { ok: false, message: 'No se pudo completar la operación. Podés reintentar sin perder los datos.' }
}
