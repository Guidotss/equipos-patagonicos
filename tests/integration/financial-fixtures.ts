import { schemaFinance } from '@/lib/documents/finance'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import { sql } from './helpers'
import { isUuid } from '@/lib/validation'

type Client = SupabaseClient<Database>
type Functions = Database['public']['Functions']
type RegisterArgs = Functions['registrar_documento']['Args']
type UpdateArgs = Functions['actualizar_documento']['Args']
type VoidArgs = Functions['anular_documento']['Args']

function object(value: Json | undefined): { [key: string]: Json | undefined } | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** Las fixtures antiguas que afirman cobro inmediato declaran efectivo confirmado y una fecha fija real. */
export async function confirmedCashFixtureData(data: Json, applications: Json | undefined, budgets: string[] = [], documentId?: string): Promise<Json> {
  const fields = object(data)
  if (!fields || fields.finance !== undefined) return data
  const [document] = documentId ? await sql<{ tipo: string; monto: string; financial_version: string }>(
    'select tipo, monto, financial_version from public.documentos where id = $1', [documentId]) : []
  const type = fields.tipo ?? document?.tipo
  if (type !== 'factura' && type !== 'orden_pago' && !['factura', 'orden_pago'].includes(document?.tipo ?? '')) return data
  const finance: { [key: string]: Json } = document ? {
    expectedVersion: Number(document.financial_version), correctionReason: 'Corrección explícita de la fixture financiera',
  } : {}
  if (type === 'orden_pago') {
    const [previous] = documentId ? await sql<{ id: string; amount: string }>(
      'select id, amount from public.payment_instruments where op_id = $1 order by id limit 1', [documentId]) : []
    const rawAmount = fields.monto ?? document?.monto
    if (rawAmount === undefined || rawAmount === null || typeof rawAmount === 'boolean' || typeof rawAmount === 'object') return data
    const instrumentId = previous?.id ?? crypto.randomUUID()
    finance.paymentInstruments = [{ id: instrumentId, kind: 'cash', status: 'confirmed', amount: String(rawAmount),
      receivedOn: null, dueOn: null, settledOn: '2024-06-20', reference: 'Efectivo declarado por la fixture', bank: '' }]
    if (Array.isArray(applications)) {
      const allocations: Json[] = []
      for (const application of applications) {
        const entry = object(application)
        if (!entry || typeof entry.factura_id !== 'string' || !isUuid(entry.factura_id) || !['number', 'string'].includes(typeof entry.monto_aplicado)) return data
        const [distribution] = await sql<{ budget_id: string | null }>(
          'select budget_id from public.invoice_allocations where invoice_id = $1 order by id limit 1', [entry.factura_id])
        const [existing] = documentId ? await sql<{ id: string }>(
          'select id from public.payment_allocations where instrument_id = $1 and invoice_id = $2 order by id limit 1', [instrumentId, entry.factura_id]) : []
        allocations.push({ ...(existing ? { id: existing.id } : {}), instrumentId,
          budgetId: distribution?.budget_id ?? budgets[0] ?? null, invoiceId: entry.factura_id, amount: String(entry.monto_aplicado) })
      }
      finance.paymentAllocations = allocations
    }
  }
  return { ...fields, finance }
}

export async function registerCashFixture(client: Client, args: RegisterArgs) {
  return client.rpc('registrar_documento', { ...args,
    p_datos: await confirmedCashFixtureData(args.p_datos, args.p_aplicaciones, args.p_presupuestos),
    p_aplicaciones: Array.isArray(args.p_aplicaciones) ? [] : args.p_aplicaciones,
  })
}

export async function updateCashFixture(client: Client, args: UpdateArgs) {
  return client.rpc('actualizar_documento', { ...args,
    p_datos: await confirmedCashFixtureData(args.p_datos, args.p_aplicaciones, args.p_presupuestos, args.p_id),
    p_aplicaciones: Array.isArray(args.p_aplicaciones) ? [] : args.p_aplicaciones,
  })
}

/** Simula la versión leída al abrir la fixture; los casos de concurrencia financiera usan la RPC sin este helper. */
export async function voidFinancialFixture(client: Client, action: 'anular_documento' | 'restaurar_documento', args: VoidArgs) {
  const [document] = await sql<{ financial_version: string }>('select financial_version from public.documentos where id = $1', [args.p_id])
  return client.rpc(action, { ...args, p_expected_version: Number(document?.financial_version ?? 1), p_reason: 'Cambio de estado declarado por la fixture' })
}

/** Las fixtures de lectura crean sus asientos explícitos antes de confirmar la inserción del documento. */
export async function insertFinancialFixture<T extends import('pg').QueryResultRow>(query: string, parameters: unknown[], budgets: string[] = []) {
  const { withConexion } = await import('./helpers')
  return withConexion(async (database) => {
    await database.query('begin')
    try {
      const result = await database.query<T>(query, parameters)
      for (const row of result.rows) {
        const { rows: [document] } = await database.query('select tipo, monto from public.documentos where id = $1', [row.id])
        if (document.tipo === 'factura') {
          const { rows: [budget] } = budgets.length === 1 ? await database.query('select id, numero, asunto from public.cotizaciones where id = $1', [budgets[0]]) : { rows: [] }
          await database.query(`insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject,
            equipment_status, amount, source) values ($1,$2,$3,$4,'unknown',$5,'explicit')`,
          [row.id, budget?.id ?? null, budget?.numero ?? null, budget?.asunto ?? null, document.monto])
        } else if (document.tipo === 'orden_pago') {
          await database.query(`insert into public.payment_instruments(op_id, kind, status, amount, settled_on)
            values ($1,'cash','confirmed',$2,'2024-06-20')`, [row.id, document.monto])
        }
      }
      await database.query('commit')
      return result.rows
    } catch (error) { await database.query('rollback'); throw error }
  })
}

export async function confirmedCashFixtureFinance(data: Json, applications: Json | undefined, budgets: string[]) {
  const prepared = object(await confirmedCashFixtureData(data, applications, budgets))
  return prepared?.finance === undefined ? undefined : schemaFinance.parse(prepared.finance)
}
