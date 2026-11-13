import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { QueueHome } from './model'

type PendingRow = Database['public']['Views']['v_inicio_colas']['Row'] & {
  exact_amount: string | null
}
export type PendingHome = PendingRow & { canLinkInvoice: boolean }
export type ResumenHome =
  Database['public']['Functions']['inicio_resumen']['Returns'][number] & {
    exact_amount: string | null
  }
export const PENDING_PER_PAGE = 25

async function notesWithExistingInvoice(
  supabase: SupabaseClient<Database>,
  rows: PendingRow[],
) {
  const notes = rows.flatMap((row) =>
    row.cola === 'para_facturar' && row.id && row.presupuesto_id
      ? [{ id: row.id, budgetId: row.presupuesto_id }]
      : [],
  )
  if (!notes.length) return new Set<string>()

  const budgetIds = [...new Set(notes.map((note) => note.budgetId))]
  const [noteLinks, invoiceLinks] = await Promise.all([
    supabase
      .from('documento_presupuestos')
      .select('documento_id, cotizacion_id')
      .in(
        'documento_id',
        notes.map((row) => row.id),
      ),
    supabase
      .from('documento_presupuestos')
      .select(
        'cotizacion_id, invoice:documentos!inner(documento_presupuestos(cotizacion_id))',
      )
      .in('cotizacion_id', budgetIds)
      .eq('invoice.tipo', 'factura')
      .is('invoice.deleted_at', null)
      .neq('invoice.tipo_comprobante', 'NC'),
  ])
  if (noteLinks.error) throw noteLinks.error
  if (invoiceLinks.error) throw invoiceLinks.error

  const invoiceBudgets = invoiceLinks.data.map(
    (link) =>
      new Set(
        link.invoice.documento_presupuestos.map(
          (budget) => budget.cotizacion_id,
        ),
      ),
  )
  return new Set(
    notes
      .filter((note) => {
        const linkedBudgets = noteLinks.data.filter(
          (link) => link.documento_id === note.id,
        )
        return (
          linkedBudgets.length > 0 &&
          invoiceBudgets.some((budgets) =>
            linkedBudgets.every((link) => budgets.has(link.cotizacion_id)),
          )
        )
      })
      .map((note) => note.id),
  )
}

export async function readHome(cola?: QueueHome, pagina = 1) {
  const supabase = await createClient()
  const [resumen, pendingList] = await Promise.all([
    supabase.rpc('inicio_resumen').select('*, exact_amount:importe::text'),
    supabase
      .rpc('inicio_pendientes', {
        p_cola: cola,
        p_limite: cola ? PENDING_PER_PAGE : 3,
        p_desde: cola ? (pagina - 1) * PENDING_PER_PAGE : 0,
      })
      .select('*, exact_amount:importe::text'),
  ])
  if (resumen.error) throw resumen.error
  if (pendingList.error) throw pendingList.error
  const linkableNotes = await notesWithExistingInvoice(
    supabase,
    pendingList.data,
  )
  return {
    resumen: resumen.data,
    pendingList: pendingList.data.map((row) => ({
      ...row,
      canLinkInvoice: row.id !== null && linkableNotes.has(row.id),
    })),
  }
}
