import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { FinanceByDocument } from './contracts'
import { invoiceAllocationSchema, paymentAllocationSchema, paymentInstrumentSchema } from './schemas'

const PAGE_SIZE = 500
const ID_BATCH_SIZE = 100

type PageResult<T> = { data: T[] | null; error: unknown }

/** El orden estable y las páginas evitan reemplazos incompletos por el límite de PostgREST. */
export async function readAllPages<T>(read: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await read(from, from + PAGE_SIZE - 1)
    if (result.error) throw result.error
    if (result.data === null) throw new Error('No se pudo completar la lectura financiera')
    const page = result.data
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function batches(ids: string[]): string[][] {
  const result: string[][] = []
  for (let index = 0; index < ids.length; index += ID_BATCH_SIZE) result.push(ids.slice(index, index + ID_BATCH_SIZE))
  return result
}

/** El cliente de sesión y RLS conservan el mismo alcance comercial que los documentos. */
export async function readFinanceByDocument(supabase: SupabaseClient<Database>, documentIds: string[]): Promise<FinanceByDocument> {
  const ids = [...new Set(documentIds)]
  const result: FinanceByDocument = Object.fromEntries(ids.map((id) => [id, {
    invoiceAllocations: [], paymentInstruments: [], paymentAllocations: [],
  }]))
  for (const batch of batches(ids)) {
    const [invoices, instruments] = await Promise.all([
      readAllPages((from, to) => supabase.from('invoice_allocations').select('id, invoice_id, budget_id, equipment_id, equipment_status, amount::text, historical_settled_amount::text').in('invoice_id', batch).order('id').range(from, to)),
      readAllPages((from, to) => supabase.from('payment_instruments').select('id, op_id, kind, status, amount::text, received_on, due_on, settled_on, reference, bank').in('op_id', batch).order('id').range(from, to)),
    ])
    for (const row of invoices) result[row.invoice_id].invoiceAllocations.push(invoiceAllocationSchema.parse({
      id: row.id, budgetId: row.budget_id, equipmentId: row.equipment_id, equipmentStatus: row.equipment_status,
      amount: row.amount, historicalSettledAmount: row.historical_settled_amount,
    }))
    for (const row of instruments) result[row.op_id].paymentInstruments.push(paymentInstrumentSchema.parse({
      id: row.id, kind: row.kind, status: row.status, amount: row.amount, receivedOn: row.received_on,
      dueOn: row.due_on, settledOn: row.settled_on, reference: row.reference, bank: row.bank,
    }))
    const owners = new Map(instruments.map((row) => [row.id, row.op_id]))
    for (const instrumentIds of batches(instruments.map((row) => row.id))) {
      const allocations = await readAllPages((from, to) => supabase.from('payment_allocations')
        .select('id, instrument_id, budget_id, invoice_id, amount::text').in('instrument_id', instrumentIds).order('id').range(from, to))
      for (const row of allocations) result[owners.get(row.instrument_id)!].paymentAllocations.push(paymentAllocationSchema.parse({
        id: row.id, instrumentId: row.instrument_id, budgetId: row.budget_id, invoiceId: row.invoice_id, amount: row.amount,
      }))
    }
  }
  return result
}
