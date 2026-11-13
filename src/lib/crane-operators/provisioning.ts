import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { createPrivilegedClient as createDefaultPrivilegedClient } from '@/lib/supabase/privileged'
import { CraneOperatorError, mapCraneOperatorRpcError } from './errors'
import {
  newCraneOperatorSchema,
  type NewCraneOperatorInput,
} from './management-schemas'

type Client = SupabaseClient<Database>
export type NewCraneOperatorResult = { userId: string; email: string }
export type ProvisionCraneOperatorOptions = {
  actorId: string
  input: NewCraneOperatorInput
  createPrivilegedClient?: () => Client
}

/** Solo contiene mensajes seguros; el ID pendiente permite recuperar un alta sin terminar. */
export class CraneOperatorProvisioningError extends CraneOperatorError {
  constructor(
    message: string,
    readonly pendingUserId: string | null = null,
  ) {
    super(message)
  }
}

async function deleteCreatedUser(
  supabase: Client,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId)
    return error === null
  } catch {
    return false
  }
}

function pendingSignupError(userId: string) {
  return new CraneOperatorProvisioningError(
    `No se pudo completar el alta ni eliminar la cuenta nueva. Pedí asistencia e informá el identificador ${userId}.`,
    userId,
  )
}

/** El llamador obtiene actorId de requireStaff; la base vuelve a comprobar su acceso al finalizar. */
export async function provisionCraneOperator(
  options: ProvisionCraneOperatorOptions,
): Promise<NewCraneOperatorResult> {
  const { name, email, password } = newCraneOperatorSchema.parse(options.input)
  const actorId = z.uuid().parse(options.actorId)
  let privileged: Client | undefined
  let createdUserId: string | undefined
  try {
    privileged = (
      options.createPrivilegedClient ?? createDefaultPrivilegedClient
    )()
    const { data, error } = await privileged.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: name },
    })
    if (error) {
      if (
        error.code === 'email_exists' ||
        error.code === 'user_already_exists'
      ) {
        throw new CraneOperatorError('Ya existe una cuenta con ese email')
      }
      throw error
    }
    createdUserId = z.uuid().parse(data.user?.id)
    const { error: completionError } = await privileged.rpc(
      'complete_crane_operator_signup',
      {
        p_user_id: createdUserId,
        p_name: name,
        p_actor_id: actorId,
      },
    )
    if (completionError) throw mapCraneOperatorRpcError(completionError)
    return { userId: createdUserId, email }
  } catch (error) {
    if (
      createdUserId &&
      privileged &&
      !(await deleteCreatedUser(privileged, createdUserId))
    ) {
      throw pendingSignupError(createdUserId)
    }
    if (error instanceof CraneOperatorError) throw error
    throw new CraneOperatorProvisioningError(
      'No se pudo crear el gruista. Volvé a intentar.',
    )
  }
}
