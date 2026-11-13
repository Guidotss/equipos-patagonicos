// Cada operación recibe el cliente de la sesión; las RPC aplican también la autorización en la base.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { mapCraneOperatorRpcError } from './errors'
import {
  craneDeliveryNoteFileSchema,
  craneDeliveryNoteSubmissionSchema,
  craneDeliveryNoteUploadSchema,
  linkCraneDeliveryNoteSchema,
  setUserAccessSchema,
  type CraneDeliveryNoteSubmissionInput,
  type CraneDeliveryNoteUploadInput,
  type LinkCraneDeliveryNoteInput,
  type SetUserAccessInput,
} from './schemas'

export { CraneOperatorError } from './errors'

type Client = SupabaseClient<Database>

export type PreparedCraneDeliveryNoteUpload = {
  uploadId: string
  path: string
  token: string
  signedUrl: string
}

/** Reserva una ruta propia antes de firmar la carga; el valor por defecto impide reemplazar archivos. */
export async function prepareCraneDeliveryNoteUpload(
  supabase: Client,
  input: CraneDeliveryNoteUploadInput,
): Promise<PreparedCraneDeliveryNoteUpload> {
  const { equipmentId, mime, size } = craneDeliveryNoteUploadSchema.parse(input)
  const { data: tickets, error: reservationError } = await supabase.rpc(
    'create_crane_delivery_note_upload',
    {
      p_mime: mime,
      p_size: size,
      p_equipment_id: equipmentId,
    },
  )
  if (reservationError) throw mapCraneOperatorRpcError(reservationError)
  const ticket = tickets?.[0]
  if (
    tickets?.length !== 1 ||
    !ticket ||
    !craneDeliveryNoteFileSchema.shape.path.safeParse(ticket.path).success
  ) {
    throw new Error('No se pudo preparar la carga del archivo')
  }
  const { data, error } = await supabase.storage
    .from('documentos')
    .createSignedUploadUrl(ticket.path)
  if (error) throw error
  return {
    uploadId: ticket.upload_id,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  }
}

export async function submitCraneDeliveryNote(
  supabase: Client,
  input: CraneDeliveryNoteSubmissionInput,
): Promise<string> {
  const {
    id,
    data: noteData,
    files,
  } = craneDeliveryNoteSubmissionSchema.parse(input)
  const { data, error } = await supabase.rpc('submit_crane_delivery_note', {
    p_id: id,
    p_data: noteData,
    p_files: files,
  })
  if (error) throw mapCraneOperatorRpcError(error)
  return data
}

export async function linkCraneDeliveryNote(
  supabase: Client,
  input: LinkCraneDeliveryNoteInput,
): Promise<string> {
  const { noteId, budgetId } = linkCraneDeliveryNoteSchema.parse(input)
  const { data, error } = await supabase.rpc('link_crane_delivery_note', {
    p_note_id: noteId,
    p_budget_id: budgetId,
  })
  if (error) throw mapCraneOperatorRpcError(error)
  return data
}

export async function setUserAccess(
  supabase: Client,
  input: SetUserAccessInput,
): Promise<void> {
  const { userId, role, active } = setUserAccessSchema.parse(input)
  const { error } = await supabase.rpc('set_user_access', {
    p_user_id: userId,
    p_role: role,
    p_active: active,
  })
  if (error) throw mapCraneOperatorRpcError(error)
}
