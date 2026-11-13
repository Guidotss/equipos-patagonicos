// Las consultas usan la sesión recibida: RLS limita al gruista a sus remitos y al personal a su acceso comercial.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import type {
  CraneDeliveryNoteDetail,
  CraneDeliveryNoteFile,
  CraneDeliveryNoteSummary,
  EquipmentOption,
  LinkableBudget,
  Page,
} from './contracts'
import { mapCraneOperatorRpcError } from './errors'
import {
  craneDeliveryNoteFiltersSchema,
  craneDeliveryNoteStatusSchema,
  paginationSchema,
  userAccessSchema,
  type CraneDeliveryNoteFilters,
  type PaginationInput,
  type UserAccess,
} from './schemas'

type Client = SupabaseClient<Database>
type NoteRow = Omit<
  Database['public']['Tables']['crane_delivery_notes']['Row'],
  'linked_by' | 'submission_data' | 'submission_files'
> & { author: { nombre: string } | null }
type FileRow = Pick<
  Database['public']['Tables']['crane_delivery_note_files']['Row'],
  'id' | 'note_id' | 'path' | 'original_name' | 'mime' | 'size'
>

const noteColumns =
  'id, operator_id, equipment_id, equipment_name, status, number, service_date, customer_name, work_description, notes, requested_budget_id, document_id, linked_budget_id, linked_at, created_at, author:profiles!crane_delivery_notes_operator_id_fkey(nombre)'
const fileColumns = 'id, note_id, path, original_name, mime, size'

function readNote(row: NoteRow): CraneDeliveryNoteSummary {
  return {
    id: row.id,
    operatorId: row.operator_id,
    authorName: row.author?.nombre ?? null,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    status: craneDeliveryNoteStatusSchema.parse(row.status),
    number: row.number,
    serviceDate: row.service_date,
    customerName: row.customer_name,
    workDescription: row.work_description,
    notes: row.notes,
    requestedBudgetId: row.requested_budget_id,
    documentId: row.document_id,
    linkedBudgetId: row.linked_budget_id,
    linkedAt: row.linked_at,
    createdAt: row.created_at,
  }
}

function readFile(row: FileRow): CraneDeliveryNoteFile {
  return {
    id: row.id,
    noteId: row.note_id,
    path: row.path,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
  }
}

export async function listOperatorCranes(
  supabase: Client,
): Promise<EquipmentOption[]> {
  const { data, error } = await supabase.rpc('list_operator_cranes')
  if (error) throw mapCraneOperatorRpcError(error)
  return (data ?? []).map((row) => ({ id: row.equipment_id, name: row.name }))
}

/** Sin operatorId, devuelve la bandeja del personal o el historial propio según RLS. */
export async function listCraneDeliveryNotes(
  supabase: Client,
  input: CraneDeliveryNoteFilters = {},
): Promise<Page<{ notes: CraneDeliveryNoteSummary[] }>> {
  const { operatorId, status, page, pageSize, order } =
    craneDeliveryNoteFiltersSchema.parse(input)
  let query = supabase
    .from('crane_delivery_notes')
    .select(noteColumns, { count: 'exact' })
  if (operatorId) query = query.eq('operator_id', operatorId)
  if (status) query = query.eq('status', status)
  const start = (page - 1) * pageSize
  if (order !== 'submission')
    query = query.order('service_date', { ascending: false })
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + pageSize - 1)
  if (error?.code === 'PGRST103' && page > 1) {
    return listCraneDeliveryNotes(supabase, { ...input, page: 1 })
  }
  if (error) throw error
  return {
    notes: (data ?? []).map(readNote),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function getCraneDeliveryNote(
  supabase: Client,
  id: string,
): Promise<CraneDeliveryNoteDetail | null> {
  const noteId = z.uuid().parse(id)
  const [{ data: note, error: noteError }, { data: files, error: filesError }] =
    await Promise.all([
      supabase
        .from('crane_delivery_notes')
        .select(noteColumns)
        .eq('id', noteId)
        .maybeSingle(),
      supabase
        .from('crane_delivery_note_files')
        .select(fileColumns)
        .eq('note_id', noteId)
        .order('position'),
    ])
  if (noteError) throw noteError
  if (filesError) throw filesError
  if (!note) return null
  return { ...readNote(note), files: (files ?? []).map(readFile) }
}

/** El UUID histórico puede sobrevivir al presupuesto; solo se enlazan destinos que siguen disponibles. */
export async function getLiveDeliveryNoteBudgetId(
  supabase: Client,
  id: string,
): Promise<string | null> {
  const budgetId = z.uuid().parse(id)
  const { data, error } = await supabase
    .from('v_presupuestos')
    .select('id')
    .eq('id', budgetId)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

/** También permite descargar remitos pendientes, que aún no tienen un documento comercial. */
export async function getCraneDeliveryNoteFile(
  supabase: Client,
  id: string,
): Promise<CraneDeliveryNoteFile | null> {
  const fileId = z.uuid().parse(id)
  const { data, error } = await supabase
    .from('crane_delivery_note_files')
    .select(fileColumns)
    .eq('id', fileId)
    .maybeSingle()
  if (error) throw error
  return data ? readFile(data) : null
}

export async function listUserAccess(supabase: Client): Promise<UserAccess[]> {
  const { data, error } = await supabase.rpc('list_user_access')
  if (error) throw mapCraneOperatorRpcError(error)
  const users = z.array(userAccessSchema).safeParse(
    (data ?? []).map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.active,
    })),
  )
  if (!users.success)
    throw new Error('No se pudo leer el acceso de los usuarios')
  return users.data
}

/** Solo el personal puede leer presupuestos comerciales, incluso finalizados o sin grúa. */
export async function listLinkableBudgets(
  supabase: Client,
  input: PaginationInput = {},
): Promise<Page<{ budgets: LinkableBudget[] }>> {
  const { page, pageSize } = paginationSchema.parse(input)
  const start = (page - 1) * pageSize
  const { data, count, error } = await supabase
    .from('cotizaciones')
    .select(
      'id, numero, asunto, equipo_id, presupuesto_estado, customer:clientes!cotizaciones_cliente_id_fkey(razon_social)',
      { count: 'exact' },
    )
    .eq('estado', 'aprobada')
    .or('presupuesto_estado.is.null,presupuesto_estado.neq.anulado')
    .order('numero', { ascending: false })
    .order('id')
    .range(start, start + pageSize - 1)
  if (error) throw error
  const budgets = (data ?? []).map((row) => ({
    id: row.id,
    number: row.numero,
    customerName: row.customer?.razon_social ?? '',
    subject: row.asunto,
    equipmentId: row.equipo_id,
    status: row.presupuesto_estado,
  }))
  return { budgets, total: count ?? 0, page, pageSize }
}
