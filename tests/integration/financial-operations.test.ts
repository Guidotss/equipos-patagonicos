import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FinanceInput } from '@/lib/documents/finance'
import type { Json } from '@/lib/supabase/database.types'
import { readFinanceByDocument } from '@/lib/finance/queries'
import { parseDecimalCents } from '@/lib/finance/amounts'
import { crearUser, removeUser, sql, withConexion, anonClient, contraTransaccionInCurso } from './helpers'
import { limpiarDocuments, limpiarFilesSubidos, newBudget, uploadFile } from './documents-helpers'

const marker = `finance-${crypto.randomUUID()}`
let staff: Awaited<ReturnType<typeof crearUser>>
let clientId: string
let otherClientId: string
let budgetId: string
let otherBudgetId: string
let secondBudgetId: string

beforeAll(async () => {
  staff = await crearUser({ activo: true, rol: 'operador' })
  ;[{ id: clientId }, { id: otherClientId }] = await sql<{ id: string }>(
    'insert into public.clientes(razon_social) values ($1), ($2) returning id', [marker, marker + '-otro'])
  budgetId = await newBudget(staff.client, clientId, marker)
  secondBudgetId = await newBudget(staff.client, clientId, marker)
  otherBudgetId = await newBudget(staff.client, otherClientId, marker)
})

afterAll(async () => {
  try {
    await limpiarDocuments(marker)
    await limpiarFilesSubidos()
    await sql('delete from public.clientes where id = any($1::uuid[])', [[clientId, otherClientId]])
  } finally { if (staff) await removeUser(staff.id) }
})

function instrument(kind: 'cash' | 'transfer' | 'check' | 'withholding', amount: string,
  status: NonNullable<FinanceInput['paymentInstruments']>[number]['status'] = kind === 'check' ? 'pending' : 'confirmed'): NonNullable<FinanceInput['paymentInstruments']>[number] {
  return { id: crypto.randomUUID(), kind, status, amount,
    receivedOn: null, dueOn: null, settledOn: status === 'confirmed' || status === 'cleared' ? '2024-06-20' : null, reference: '', bank: '' }
}

function billed(amount: string, budget: string | null = budgetId) {
  return { budgetId: budget, equipmentId: null, equipmentStatus: 'unknown' as const, amount, historicalSettledAmount: '0' }
}

async function register(type: 'factura' | 'orden_pago', amount: string, finance?: FinanceInput, budgets = [budgetId], customer = clientId, invoiceType = 'FA') {
  const file = await uploadFile(staff.client, customer)
  return staff.client.rpc('registrar_documento', {
    p_datos: { cliente_id: customer, tipo: type, monto: amount, tipo_comprobante: type === 'factura' ? invoiceType : null,
      notas: marker, ...(finance ? { finance } : {}) },
    p_presupuestos: budgets, p_archivos: [file],
  })
}

async function invoice(amount = '1000', finance?: FinanceInput, budgets?: string[]) {
  const result = await register('factura', amount, finance, budgets)
  if (result.error) throw result.error
  return result.data
}

async function order(entries: NonNullable<FinanceInput['paymentInstruments']>, invoiceId: string | null,
  amount?: string, budget: string = budgetId) {
  const result = await register('orden_pago', amount ?? String(entries.reduce((sum, entry) => sum + Number(entry.amount), 0)), {
    paymentInstruments: entries,
    paymentAllocations: entries.map((entry) => ({ instrumentId: entry.id, budgetId: budget, invoiceId, amount: entry.amount })),
  })
  if (result.error) throw result.error
  return result.data
}

async function totals(invoiceId: string) {
  const [row] = await sql(`select coalesce(sum(money),0)::text as money, coalesce(sum(withholding),0)::text as withholding,
    coalesce(sum(legacy_applied),0)::text as legacy, coalesce(sum(reserved),0)::text as reserved
    from private.financial_ledger($1) where invoice_id = $2`, [clientId, invoiceId])
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))
}

async function version(id: string) {
  return (await sql<{ financial_version: string }>('select financial_version from public.documentos where id = $1', [id]))[0].financial_version
}

async function edit(id: string, type: 'factura' | 'orden_pago', amount: string, finance: FinanceInput) {
  return staff.client.rpc('actualizar_documento', { p_id: id,
    p_datos: { tipo: type, monto: amount, tipo_comprobante: type === 'factura' ? 'FA' : null, notas: marker, finance } })
}

async function status(opId: string, entryId: string, expectedVersion: number, next: string, date: string | null = null, reason = '') {
  return staff.client.rpc('change_payment_instrument_status', { p_op_id: opId, p_instrument_id: entryId,
    p_expected_version: expectedVersion, p_status: next, ...(date ? { p_settled_on: date } : {}), p_reason: reason })
}

describe('autoridad monetaria y auditoría financiera', () => {
  it('proyecta partes desiguales, retenciones, cheques y anulaciones sin duplicar la factura', async () => {
    const firstBudget = await newBudget(staff.client, clientId, marker)
    const secondBudget = await newBudget(staff.client, clientId, marker)
    const id = await invoice('1000', { invoiceAllocations: [billed('800', firstBudget), billed('200', secondBudget)] }, [firstBudget, secondBudget])
    const cash = instrument('cash', '100')
    const withholding = instrument('withholding', '50')
    const check = instrument('check', '200')
    const op = await register('orden_pago', '350', { paymentInstruments: [cash, withholding, check], paymentAllocations: [
      { instrumentId: cash.id, budgetId: firstBudget, invoiceId: id, amount: '100' },
      { instrumentId: withholding.id, budgetId: firstBudget, invoiceId: id, amount: '50' },
      { instrumentId: check.id, budgetId: secondBudget, invoiceId: id, amount: '200' },
    ] }, [firstBudget, secondBudget])
    expect(op.error).toBeNull()
    const finance = await readFinanceByDocument(staff.client, [id, op.data!])
    expect(finance[id].invoiceAllocations.map((entry) => entry.amount).sort()).toEqual(['200.00', '800.00'])
    expect(finance[op.data!].paymentInstruments).toHaveLength(3)
    expect(finance[op.data!].paymentAllocations).toHaveLength(3)
    const invoiceView = async () => (await sql('select cobrado::text, saldo::text, credited_money::text, withheld_amount::text, pending_check_amount::text, available_amount::text from public.v_facturas where id = $1', [id]))[0]
    const budgetViews = async () => sql('select id, facturado::text, saldo::text, balance_determinate from public.v_presupuestos where id = any($1::uuid[]) order by facturado desc', [[firstBudget, secondBudget]])
    expect(await invoiceView()).toMatchObject({ cobrado: '150.00', saldo: '850.00', credited_money: '100.00', withheld_amount: '50.00', pending_check_amount: '200.00', available_amount: '650.00' })
    expect(await budgetViews()).toEqual([
      { id: firstBudget, facturado: '800.00', saldo: '650.00', balance_determinate: true },
      { id: secondBudget, facturado: '200.00', saldo: '200.00', balance_determinate: true },
    ])
    expect((await status(op.data!, check.id, 1, 'cleared', '2024-06-20')).error).toBeNull()
    expect(await invoiceView()).toMatchObject({ cobrado: '350.00', saldo: '650.00', pending_check_amount: '0' })
    expect((await budgetViews())[1]).toMatchObject({ saldo: '0.00' })
    expect((await staff.client.rpc('anular_documento', { p_id: op.data!, p_expected_version: 2, p_reason: 'Anulación de prueba' })).error).toBeNull()
    expect(await invoiceView()).toMatchObject({ cobrado: '0', saldo: '1000.00' })
    expect((await staff.client.rpc('restaurar_documento', { p_id: op.data!, p_expected_version: 3, p_reason: 'Restauración de prueba' })).error).toBeNull()
    expect(await invoiceView()).toMatchObject({ cobrado: '350.00', saldo: '650.00' })
  })

  it('distingue reparto monetario pendiente de equipo desconocido y fondos sin asignar', async () => {
    const firstBudget = await newBudget(staff.client, clientId, marker)
    const secondBudget = await newBudget(staff.client, clientId, marker)
    await invoice('100', { invoiceAllocations: [billed('100', firstBudget)] }, [firstBudget])
    expect((await sql('select saldo::text, balance_determinate from public.v_presupuestos where id = $1', [firstBudget]))[0]).toEqual({ saldo: '100.00', balance_determinate: true })
    await invoice('200', undefined, [firstBudget, secondBudget])
    expect(await sql('select saldo, balance_determinate, linked_unallocated_invoice_amount::text from public.v_presupuestos where id = any($1::uuid[]) order by id', [[firstBudget, secondBudget]]))
      .toEqual(expect.arrayContaining([{ saldo: null, balance_determinate: false, linked_unallocated_invoice_amount: '200.00' }, { saldo: null, balance_determinate: false, linked_unallocated_invoice_amount: '200.00' }]))
    const cash = instrument('cash', '50')
    const op = await register('orden_pago', '50', { paymentInstruments: [cash] }, [firstBudget])
    expect(op.error).toBeNull()
    expect((await sql('select linked_unallocated_instrument_count::int as count, linked_unallocated_instrument_amount::text as amount from public.v_presupuestos where id = $1', [firstBudget]))[0]).toEqual({ count: 1, amount: '50.00' })
  })

  it('requiere medios explícitos y conserva la condición de pago como texto', async () => {
    expect((await register('orden_pago', '100')).error?.message).toContain('Declará los medios')
    const entry = instrument('cash', '100')
    const id = await order([entry], null)
    expect((await staff.client.rpc('actualizar_documento', { p_id: id,
      p_datos: { tipo: 'orden_pago', monto: 100, notas: marker, payment_condition: '30/45/60 días', finance: { expectedVersion: 1 } } })).error).toBeNull()
    expect(await sql('select payment_condition from public.documentos where id = $1', [id])).toEqual([{ payment_condition: '30/45/60 días' }])
    expect(await sql('select count(*)::int as count from public.payment_instruments where op_id = $1', [id])).toEqual([{ count: 1 }])
  })

  it('separa efectivo, retención y dos cheques; solo la compensación acredita dinero una vez', async () => {
    const id = await invoice()
    const entries = [instrument('cash', '100'), instrument('withholding', '50'), instrument('check', '400'), instrument('check', '450')]
    const opId = await order(entries, id)
    expect(await totals(id)).toEqual({ money: 100, withholding: 50, legacy: 0, reserved: 850 })
    expect((await status(opId, entries[2].id, 1, 'cleared', '2024-07-01')).error).toBeNull()
    expect(await totals(id)).toEqual({ money: 500, withholding: 50, legacy: 0, reserved: 450 })
    expect((await status(opId, entries[2].id, 1, 'cleared', '2024-07-01')).error?.message).toContain('cambió')
    expect((await status(opId, entries[2].id, 2, 'cleared', '2024-07-01')).error).toBeNull()
    expect(await version(opId)).toBe('2')
    expect(await sql('select before_version::int, after_version::int from public.financial_events where document_id = $1 order by after_version', [opId]))
      .toEqual([{ before_version: 0, after_version: 1 }, { before_version: 1, after_version: 2 }])
    expect((await status(opId, entries[2].id, 2, 'pending')).error?.message).toContain('motivo')
    expect((await status(opId, entries[2].id, 2, 'pending', null, 'Se revirtió la compensación bancaria')).error).toBeNull()
    expect(await totals(id)).toEqual({ money: 100, withholding: 50, legacy: 0, reserved: 850 })
  })

  it('el cheque rechazado conserva su valor facial pero libera la reserva', async () => {
    const id = await invoice('100')
    const entry = instrument('check', '100')
    const opId = await order([entry], id)
    expect((await status(opId, entry.id, 1, 'rejected')).error).toBeNull()
    expect(await totals(id)).toEqual({ money: 0, withholding: 0, legacy: 0, reserved: 0 })
    expect((await sql('select cobrado::text, pending_check_amount::text, saldo::text from public.v_facturas where id = $1', [id]))[0])
      .toEqual({ cobrado: '0', pending_check_amount: '0', saldo: '100.00' })
    await order([instrument('cash', '100')], id)
    expect((await status(opId, entry.id, 2, 'pending')).error?.message).toContain('superan')
    expect(await sql('select amount, status from public.payment_instruments where id = $1', [entry.id]))
      .toEqual([{ amount: '100.00', status: 'rejected' }])
  })

  it.each(['pending', 'cleared', 'rejected'] as const)('reemplaza el cheque %s omitido conservando su registro y la aplicación estable', async (initialStatus) => {
    const id = await invoice('100')
    const check = { ...instrument('check', '100', initialStatus), reference: 'Cheque original', bank: 'Banco original',
      receivedOn: '2024-06-10', dueOn: '2024-08-01' }
    const opId = await order([check], id)
    const [before] = await sql('select id, kind, amount, received_on, due_on, settled_on, reference, bank, created_at from public.payment_instruments where id = $1', [check.id])
    const replacement = instrument('cash', '100')
    const [allocation] = await sql<{ id: string }>('select id from public.payment_allocations where instrument_id = $1', [check.id])
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1, correctionReason: 'Cheque reemplazado por efectivo acreditado',
      paymentInstruments: [replacement], paymentAllocations: [
        { id: allocation.id, instrumentId: replacement.id, budgetId, invoiceId: id, amount: '100' },
      ] })).error).toBeNull()
    expect(await totals(id)).toEqual({ money: 100, withholding: 0, legacy: 0, reserved: 0 })
    expect(await sql('select id from public.payment_allocations where instrument_id = $1', [replacement.id])).toEqual([{ id: allocation.id }])
    expect(await sql('select id, kind, amount, received_on, due_on, settled_on, reference, bank, created_at, status from public.payment_instruments where id = $1', [check.id]))
      .toEqual([{ ...before, status: 'voided' }])
    expect(await sql('select status from public.payment_instruments where id = $1', [replacement.id])).toEqual([{ status: 'confirmed' }])
    // Volver a omitir el cheque ya anulado no lo elimina ni inventa otra versión.
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 2, paymentInstruments: [replacement] })).error).toBeNull()
    expect(await version(opId)).toBe('2')
    expect(await sql('select status from public.payment_instruments where id = $1', [check.id])).toEqual([{ status: 'voided' }])
  })

  it('distingue colección omitida, reemplazo y lista vacía sin dejar reservas activas ocultas', async () => {
    const id = await invoice('100')
    const check = instrument('check', '100')
    const opId = await order([check], id)
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1 })).error).toBeNull()
    expect((await totals(id)).reserved).toBe(100)
    const replacement = instrument('cash', '100')
    // Las aplicaciones omitidas se conservan en el cheque histórico; no se trasladan al efectivo automáticamente.
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1, paymentInstruments: [replacement] })).error).toBeNull()
    expect(await totals(id)).toEqual({ money: 0, withholding: 0, legacy: 0, reserved: 0 })
    expect(await sql('select invoice_id from public.payment_allocations where instrument_id = $1', [check.id])).toEqual([{ invoice_id: id }])
    expect(await sql('select status from public.payment_instruments where id = $1', [check.id])).toEqual([{ status: 'voided' }])
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 2, paymentAllocations: [] })).error).toBeNull()
    expect(await sql('select id from public.payment_allocations where instrument_id = $1', [check.id])).toEqual([])
    expect(await sql('select status from public.payment_instruments where id = $1', [check.id])).toEqual([{ status: 'voided' }])
    // Vaciar todos los medios no puede dejar una OP positiva incompleta; la transacción revierte íntegra.
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 3, correctionReason: 'Intento de vaciado', paymentInstruments: [] })).error?.code).toBe('P0001')
    expect(await version(opId)).toBe('3')
    expect(await sql('select status from public.payment_instruments where id = $1', [replacement.id])).toEqual([{ status: 'confirmed' }])
  })

  it('rechaza reactivar una aplicación a factura anulada tanto por estado como por DTO completo', async () => {
    const id = await invoice('100')
    const check = instrument('check', '100')
    const opId = await order([check], id)
    expect((await status(opId, check.id, 1, 'rejected')).error).toBeNull()
    expect((await staff.client.rpc('anular_documento', { p_id: id, p_expected_version: 1, p_reason: 'Factura anulada' })).error).toBeNull()
    expect((await status(opId, check.id, 2, 'cleared', '2024-06-20')).error?.code).toBe('P0001')
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 2,
      paymentInstruments: [{ ...check, status: 'cleared', settledOn: '2024-06-20' }] })).error?.code).toBe('P0001')
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 2,
      paymentInstruments: [{ ...check, status: 'pending' }] })).error?.code).toBe('P0001')
    expect(await version(opId)).toBe('2')
    expect(await sql('select status from public.payment_instruments where id = $1', [check.id])).toEqual([{ status: 'rejected' }])
    expect(await totals(id)).toEqual({ money: 0, withholding: 0, legacy: 0, reserved: 0 })
  })

  it('revalida el destino al mover una aplicación estable a otro instrumento', async () => {
    const id = await invoice('100')
    const check = instrument('check', '100')
    const opId = await order([check], id)
    const [allocation] = await sql<{ id: string }>('select id from public.payment_allocations where instrument_id = $1', [check.id])
    expect((await staff.client.rpc('anular_documento', { p_id: id, p_expected_version: 1, p_reason: 'Factura anulada' })).error).toBeNull()
    const replacement = instrument('cash', '100')
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1,
      paymentInstruments: [{ ...check, status: 'voided' }, replacement], paymentAllocations: [
        { id: allocation.id, instrumentId: replacement.id, budgetId, invoiceId: id, amount: '100' },
      ] })).error?.code).toBe('P0001')
    expect(await version(opId)).toBe('1')
    expect(await sql('select instrument_id from public.payment_allocations where id = $1', [allocation.id])).toEqual([{ instrument_id: check.id }])
    expect(await sql('select id from public.payment_instruments where id = $1', [replacement.id])).toEqual([])
  })

  it.each(['status', 'dto'] as const)('conserva el anticipo vigente y admite metadatos y compensación normal por %s', async (path) => {
    const id = await invoice('100')
    const check = instrument('check', '100')
    const opId = await order([check], id)
    const [allocation] = await sql<{ id: string }>('select id from public.payment_allocations where instrument_id = $1', [check.id])
    expect((await staff.client.rpc('anular_documento', { p_id: id, p_expected_version: 1, p_reason: 'Factura anulada' })).error).toBeNull()
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1, paymentInstruments: [check], paymentAllocations: [
      { id: allocation.id, instrumentId: check.id, budgetId, invoiceId: id, amount: '100' },
    ] })).error).toBeNull()
    expect(await version(opId)).toBe('1')
    const result = path === 'status' ? await status(opId, check.id, 1, 'cleared', '2024-06-20') : await edit(opId, 'orden_pago', '100', {
      expectedVersion: 1, paymentInstruments: [{ ...check, status: 'cleared', settledOn: '2024-06-20' }],
    })
    expect(result.error).toBeNull()
    expect(await sql('select invoice_id from public.payment_allocations where id = $1', [allocation.id])).toEqual([{ invoice_id: id }])
    expect(await totals(id)).toEqual({ money: 100, withholding: 0, legacy: 0, reserved: 0 })
  })

  it('reserva concurrentemente 700 sobre 1000 una sola vez', async () => {
    const id = await invoice()
    const results = await Promise.all([instrument('check', '700'), instrument('check', '700')].map((entry) =>
      register('orden_pago', '700', { paymentInstruments: [entry], paymentAllocations: [{ instrumentId: entry.id, budgetId, invoiceId: id, amount: '700' }] })))
    expect(results.filter((result) => result.error === null)).toHaveLength(1)
    expect(results.find((result) => result.error)?.error?.message).toContain('superan')
    expect((await totals(id)).reserved).toBe(700)
  })

  it('admite reparto parcial desigual y respeta los límites de cada trabajo', async () => {
    const id = await invoice('1000', { invoiceAllocations: [billed('800'), billed('200', secondBudgetId)] }, [budgetId, secondBudgetId])
    const first = instrument('transfer', '650')
    const opId = await order([first], id)
    expect((await totals(id)).money).toBe(650)
    const second = instrument('cash', '250')
    expect((await register('orden_pago', '250', { paymentInstruments: [second], paymentAllocations: [
      { instrumentId: second.id, budgetId: secondBudgetId, invoiceId: id, amount: '250' },
    ] })).error?.message).toContain('parte facturada')
    expect(await version(opId)).toBe('1')
  })

  it('no usa vínculos administrativos para distribuir facturas compartidas ni pagos nuevos', async () => {
    const id = await invoice('100', undefined, [budgetId, secondBudgetId])
    expect(await sql('select budget_id, equipment_status, amount from public.invoice_allocations where invoice_id = $1', [id]))
      .toEqual([{ budget_id: null, equipment_status: 'unknown', amount: '100.00' }])
    const entry = instrument('cash', '100')
    expect((await register('orden_pago', '100', { paymentInstruments: [entry], paymentAllocations: [
      { instrumentId: entry.id, budgetId, invoiceId: id, amount: '100' },
    ] })).error?.message).toContain('distribución')
    expect((await register('orden_pago', '100', { paymentInstruments: [entry], paymentAllocations: [
      { instrumentId: entry.id, budgetId: null, invoiceId: null, amount: '100' },
    ] })).error?.message).toContain('trabajo conocido')
  })

  it('aplica un anticipo existente sin fabricar otro instrumento ni otro cobro', async () => {
    const advances = async () => parseDecimalCents((await sql<{ amount: string }>('select unapplied_advances::text as amount from public.v_presupuestos where id = $1', [budgetId]))[0].amount)!
    const before = await advances()
    const entry = instrument('transfer', '100')
    const opId = await order([entry], null)
    expect(await advances()).toBe(before + BigInt(10000))
    const id = await invoice('300')
    const [allocation] = await sql<{ id: string }>('select id from public.payment_allocations where instrument_id = $1', [entry.id])
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1, correctionReason: 'Aplicación del anticipo a la factura recibida',
      paymentAllocations: [{ id: allocation.id, instrumentId: entry.id, budgetId, invoiceId: id, amount: '100' }] })).error).toBeNull()
    expect((await totals(id)).money).toBe(100)
    expect(await advances()).toBe(before)
    expect((await sql('select cobrado::text, saldo::text from public.v_facturas where id = $1', [id]))[0])
      .toEqual({ cobrado: '100.00', saldo: '200.00' })
    expect(await sql('select count(*)::int as count, sum(amount)::text as amount from public.payment_instruments where op_id = $1', [opId]))
      .toEqual([{ count: 1, amount: '100.00' }])
    expect(300 - (await totals(id)).money).toBe(200)
    expect((await edit(opId, 'orden_pago', '100', { expectedVersion: 1 })).error?.message).toContain('cambió')
  })

  it('rechaza precisión excesiva, tipos falsos y cobros futuros sin redondear ni escribir parcialmente', async () => {
    for (const invalid of ['1.001', '1000000000000', '-1', 'NaN', '1e2']) {
      expect((await register('factura', '100', { invoiceAllocations: [billed(invalid)] })).error?.code).toBe('P0001')
    }
    expect((await register('factura', '100', { invoiceAllocations: [{ ...billed('100'), historicalSettledAmount: '101' }] })).error?.code).toBe('P0001')
    expect((await register('factura', '100', { invoiceAllocations: [{ ...billed('100'), historicalSettledAmount: '1' }] })).error?.code).toBe('P0001')
    const tiny = await invoice('0.01')
    await order([instrument('cash', '0.01')], tiny)
    expect((await totals(tiny)).money).toBe(0.01)
    const future = { ...instrument('cash', '100'), settledOn: '2099-01-01' }
    expect((await register('orden_pago', '100', { paymentInstruments: [future] })).error?.code).toBe('P0001')
    const file = await uploadFile(staff.client, clientId)
    for (const finance of [{ invoiceAllocations: false }, { expectedVersion: '1' }, { fakeActor: staff.id }]) {
      const result = await staff.client.rpc('registrar_documento', { p_datos: { tipo: 'factura', cliente_id: clientId, monto: 100,
        tipo_comprobante: 'FA', notas: marker, finance }, p_presupuestos: [budgetId], p_archivos: [file] })
      expect(result.error?.code).toBe('P0001')
    }
    expect(await sql('select id from public.documento_archivos where path = $1', [file.path])).toEqual([])
  })

  it('rechaza IDs ajenos, clientes distintos, notas de crédito y duplicación del modelo viejo', async () => {
    const id = await invoice()
    const nc = await register('factura', '100', undefined, [budgetId], clientId, 'NC')
    const entry = instrument('cash', '100')
    const opId = await order([entry], id)
    expect((await register('orden_pago', '100', { paymentInstruments: [entry] })).error?.message).toContain('otra orden')
    for (const target of [{ invoiceId: nc.data!, budgetId }, { invoiceId: id, budgetId: otherBudgetId }]) {
      const payment = instrument('cash', '100')
      expect((await register('orden_pago', '100', { paymentInstruments: [payment], paymentAllocations: [{ instrumentId: payment.id, ...target, amount: '100' }] })).error?.code).toBe('P0001')
    }
    const [allocation] = await sql<{ id: string }>('select id from public.invoice_allocations where invoice_id = $1', [id])
    expect((await register('factura', '100', { invoiceAllocations: [{ ...billed('100'), id: allocation.id }] })).error?.message).toContain('otra factura')
    expect((await staff.client.rpc('actualizar_documento', { p_id: opId, p_datos: { tipo: 'orden_pago', monto: 100, notas: marker,
      finance: { expectedVersion: 1 } }, p_aplicaciones: [{ factura_id: id, monto_aplicado: 100 }] })).error?.message).toContain('finance.paymentAllocations')
    expect(await version(opId)).toBe('1')
  })

  it('mantiene fondos sin trabajo ni factura hasta que se aplican explícitamente', async () => {
    const entry = instrument('cash', '100')
    const result = await register('orden_pago', '100', { paymentInstruments: [entry] }, [])
    expect(result.error).toBeNull()
    expect(await sql('select id from public.payment_allocations where instrument_id = $1', [entry.id])).toEqual([])
    const id = await invoice('300')
    expect((await edit(result.data!, 'orden_pago', '100', { expectedVersion: 1, correctionReason: 'Aplicación del fondo disponible',
      paymentAllocations: [{ instrumentId: entry.id, budgetId, invoiceId: id, amount: '100' }] })).error).toBeNull()
    expect((await totals(id)).money).toBe(100)
    expect(await sql('select count(*)::int as count from public.payment_instruments where op_id = $1', [result.data])).toEqual([{ count: 1 }])
  })

  it('un UUID concurrente ajeno nunca permite modificar un medio de otro cliente', async () => {
    const shared = instrument('cash', '300')
    const foreignFile = await uploadFile(staff.client, otherClientId)
    const own = instrument('cash', '100')
    const result = await contraTransaccionInCurso(staff.id,
      'select public.registrar_documento($1::jsonb,$2::uuid[],$3::jsonb)',
      [JSON.stringify({ cliente_id: otherClientId, tipo: 'orden_pago', monto: '300', notas: marker,
        finance: { paymentInstruments: [shared] } }), [otherBudgetId], JSON.stringify([foreignFile])],
      () => register('orden_pago', '100', { paymentInstruments: [own, { ...shared, amount: '999' }] }))
    expect(result.error?.code).toBe('P0001')
    expect(await sql('select amount from public.payment_instruments where id = $1', [shared.id])).toEqual([{ amount: '300.00' }])
    expect(await sql('select id from public.payment_instruments where id = $1', [own.id])).toEqual([])
  })

  it('anula fondos y valida su capacidad al restaurar; exige la versión capturada', async () => {
    const id = await invoice('100')
    const entry = instrument('check', '100')
    const opId = await order([entry], id)
    expect((await staff.client.rpc('anular_documento', { p_id: opId })).error?.message).toContain('versión')
    expect((await staff.client.rpc('anular_documento', { p_id: opId, p_expected_version: 1, p_reason: 'Orden anulada' })).error).toBeNull()
    await order([instrument('cash', '100')], id)
    expect((await staff.client.rpc('restaurar_documento', { p_id: opId, p_expected_version: 2, p_reason: 'Restauración' })).error?.message).toContain('superan')
    expect(await version(opId)).toBe('2')
  })

  it('anula una factura sin borrar fondos ni sus referencias originales', async () => {
    const id = await invoice('100')
    const entry = instrument('cash', '100')
    await order([entry], id)
    const [before] = await sql<{ advance: string; credited: string }>('select unapplied_advances::text as advance, credited_money::text as credited from public.v_presupuestos where id = $1', [budgetId])
    expect((await staff.client.rpc('anular_documento', { p_id: id, p_expected_version: 1, p_reason: 'Factura emitida incorrectamente' })).error).toBeNull()
    const [after] = await sql<{ advance: string; credited: string }>('select unapplied_advances::text as advance, credited_money::text as credited from public.v_presupuestos where id = $1', [budgetId])
    expect(parseDecimalCents(after.advance)! - parseDecimalCents(before.advance)!).toBe(BigInt(10000))
    expect(after.credited).toBe(before.credited)
    expect(await sql('select invoice_id, amount from public.payment_allocations where instrument_id = $1', [entry.id]))
      .toEqual([{ invoice_id: id, amount: '100.00' }])
    expect((await totals(id)).money).toBe(100)
    expect((await staff.client.rpc('restaurar_documento', { p_id: id, p_expected_version: 2, p_reason: 'Comprobante confirmado' })).error).toBeNull()
  })

  it('conserva colecciones en edición de metadatos y rechaza la remoción antigua sin finance', async () => {
    const id = await invoice('100')
    const entry = instrument('cash', '100')
    const opId = await order([entry], id)
    expect((await staff.client.rpc('actualizar_documento', { p_id: opId,
      p_datos: { tipo: 'orden_pago', monto: '100', notas: marker, numero: 'Metadato' } })).error).toBeNull()
    expect(await version(opId)).toBe('1')
    expect((await staff.client.rpc('actualizar_documento', { p_id: opId,
      p_datos: { tipo: 'orden_pago', monto: '100', notas: marker }, p_aplicaciones: [] })).error?.message).toContain('finance.paymentAllocations')
    expect((await totals(id)).money).toBe(100)
    expect((await staff.client.rpc('actualizar_documento', { p_id: opId,
      p_datos: { tipo: 'orden_compra', notas: marker, finance: { expectedVersion: 1, correctionReason: 'No borra fondos' } } })).error?.message).toContain('medios de pago')
    expect((await staff.client.rpc('actualizar_documento', { p_id: id,
      p_datos: { tipo: 'factura', tipo_comprobante: 'NC', monto: '100', notas: marker } })).error?.message).toContain('versión')
  })

  it('el respaldo diferido impide confirmar escrituras antiguas incompletas', async () => {
    await withConexion(async (database) => {
      await database.query('begin')
      try {
        const { rows: [document] } = await database.query("insert into public.documentos(cliente_id, tipo, monto, tipo_comprobante) values ($1, 'factura', 100, 'FA') returning id", [clientId])
        await database.query('insert into public.documento_presupuestos values ($1, $2)', [document.id, budgetId])
        await expect(database.query('commit')).rejects.toMatchObject({ code: 'P0001' })
      } finally { await database.query('rollback') }
    })
  })

  it('los gruistas, inactivos y anónimos se rechazan antes de validar finance', async () => {
    for (const options of [{ activo: true, rol: 'crane_operator' as const }, { activo: false, rol: 'operador' as const }]) {
      const user = await crearUser(options)
      try {
        const result = await user.client.rpc('registrar_documento', { p_datos: { finance: false }, p_presupuestos: [], p_archivos: [] })
        expect(result.error?.code).toBe('42501')
        for (const view of ['v_facturas', 'v_presupuestos', 'v_financial_ledger', 'v_payment_instrument_balances'] as const) {
          const read = await user.client.from(view).select('*')
          expect(read.error).toBeNull()
          expect(read.data).toEqual([])
        }
      } finally { await removeUser(user.id) }
    }
    const result = await anonClient().rpc('registrar_documento', { p_datos: { finance: false } as Json, p_presupuestos: [], p_archivos: [] })
    expect(result.error?.code).toBe('42501')
    for (const view of ['v_facturas', 'v_presupuestos', 'v_financial_ledger', 'v_payment_instrument_balances'] as const) {
      const read = await anonClient().from(view).select('*')
      expect(read.error).not.toBeNull()
    }
  })
})
