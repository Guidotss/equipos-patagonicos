import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { readLegacyFinancialSnapshot } from '../../scripts/financial-upgrade-fixtures.mjs'
import { sql, withConexion } from './helpers'

type Snapshot = {
  ids: Record<string, string>
  before: Record<string, Record<string, unknown>[]>
}
let snapshot: Snapshot

// Esta suite solo representa una actualización cuando la semilla precedió a la migración.
describe.runIf(Boolean(process.env.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT))('actualización real desde el modelo financiero anterior', () => {
  beforeAll(async () => {
    snapshot = JSON.parse(await readFile(process.env.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT!, 'utf8'))
  })

  it('conserva exactamente saldos individuales/globales, documentos, vínculos, aplicaciones, archivos y evidencia', async () => {
    const after = await withConexion(readLegacyFinancialSnapshot) as Snapshot['before']
    after.documents = after.documents.map((entry) => {
      const { payment_condition, financial_version, ...legacy } = entry.row as Record<string, unknown>
      expect(payment_condition).toBe('')
      expect(financial_version).toBe(1)
      return { row: legacy }
    })
    expect(after).toEqual(snapshot.before)
  })

  it('atribuye una sola vez los 1000 compartidos a Sin distribuir y deja desconocida la grúa del trabajo único', async () => {
    const { sharedInvoice, singleInvoice, firstBudget, equipmentId, orphanInvoice } = snapshot.ids
    expect(await sql('select equipo_id from public.cotizaciones where id = $1', [firstBudget]))
      .toEqual([{ equipo_id: equipmentId }])
    const allocation = (id: string) => sql(`select budget_id, equipment_id, equipment_name, equipment_status,
      amount, historical_settled_amount, source from public.invoice_allocations where invoice_id = $1`, [id])
    expect(await allocation(sharedInvoice)).toEqual([{ budget_id: null, equipment_id: null, equipment_name: null,
      equipment_status: 'unknown', amount: '1000.00', historical_settled_amount: '0.00', source: 'legacy_unallocated' }])
    expect(await allocation(singleInvoice)).toEqual([{ budget_id: firstBudget, equipment_id: null, equipment_name: null,
      equipment_status: 'unknown', amount: '600.00', historical_settled_amount: '0.00', source: 'legacy_single_budget' }])
    expect(await allocation(orphanInvoice)).toEqual([{ budget_id: null, equipment_id: null, equipment_name: null,
      equipment_status: 'unknown', amount: '150.00', historical_settled_amount: '0.00', source: 'legacy_unallocated' }])
  })

  it('conserva 300 reconocidos y 200 sin clasificar, sin simular efectivo, retenciones o fechas', async () => {
    const { partialOrder, sharedInvoice } = snapshot.ids
    expect(await sql(`select kind, status, amount, received_on, due_on, settled_on from public.payment_instruments
      where op_id = $1 order by status`, [partialOrder])).toEqual([
      { kind: 'legacy_unidentified', status: 'legacy_recognized', amount: '300.00', received_on: null, due_on: null, settled_on: null },
      { kind: 'legacy_unidentified', status: 'legacy_unclassified', amount: '200.00', received_on: null, due_on: null, settled_on: null },
    ])
    expect(await sql(`select a.budget_id, a.invoice_id, a.amount, a.source from public.payment_allocations a
      join public.payment_instruments i on i.id = a.instrument_id where i.op_id = $1`, [partialOrder]))
      .toEqual([{ budget_id: null, invoice_id: sharedInvoice, amount: '300.00', source: 'legacy' }])
    expect(await sql(`select id from public.payment_instruments where kind <> 'legacy_unidentified'
      or received_on is not null or due_on is not null or settled_on is not null`)).toEqual([])
  })

  it('protege los 1210 históricos en su trabajo original sin crear OP ni instrumentos ficticios', async () => {
    const { historicalInvoice, historicalBudget } = snapshot.ids
    expect(await sql(`select budget_id, equipment_status, historical_settled_amount, amount, source
      from public.invoice_allocations where invoice_id = $1`, [historicalInvoice])).toEqual([
      { budget_id: historicalBudget, equipment_status: 'unknown', historical_settled_amount: '1210.00', amount: '1210.00', source: 'historical_import' },
    ])
    expect(await sql('select id from public.payment_allocations where invoice_id = $1', [historicalInvoice])).toEqual([])
    expect(await sql("select id from public.documentos where tipo = 'orden_pago' order by id"))
      .toEqual(snapshot.before.documents.filter(({ row }) => (row as Record<string, unknown>).tipo === 'orden_pago')
        .map(({ row }) => ({ id: (row as Record<string, unknown>).id })))
  })

  it('mantiene anulados y reproduce las aplicaciones incluso hacia facturas inactivas', async () => {
    const { inactiveInvoice, inactiveOrder, inactiveInvoiceOrder, firstBudget } = snapshot.ids
    expect(await sql('select id from public.documentos where deleted_at is not null order by id'))
      .toEqual(snapshot.before.documents.filter(({ row }) => (row as Record<string, unknown>).deleted_at !== null)
        .map(({ row }) => ({ id: (row as Record<string, unknown>).id })))
    expect(await sql(`select i.op_id, a.invoice_id, a.budget_id, a.amount from public.payment_allocations a
      join public.payment_instruments i on i.id = a.instrument_id
      where i.op_id in ($1, $2) order by i.op_id`, [inactiveInvoiceOrder, inactiveOrder]))
      .toEqual([
        { op_id: inactiveInvoiceOrder, invoice_id: inactiveInvoice, budget_id: firstBudget, amount: '80.00' },
        { op_id: inactiveOrder, invoice_id: snapshot.ids.singleInvoice, budget_id: firstBudget, amount: '50.00' },
      ].sort((a, b) => a.op_id.localeCompare(b.op_id)))
    expect(await sql(`select d.id from public.documentos d
      left join public.invoice_allocations a on a.invoice_id = d.id where d.tipo = 'factura'
      group by d.id having coalesce(sum(a.amount), 0) <> d.monto`)).toEqual([])
    expect(await sql(`select d.id from public.documentos d
      left join public.payment_instruments i on i.op_id = d.id where d.tipo = 'orden_pago'
      group by d.id having coalesce(sum(i.amount), 0) <> d.monto`)).toEqual([])
  })

  it('habilita SELECT solo a personal y no concede DML autenticado en el modelo nuevo', async () => {
    for (const table of ['invoice_allocations', 'payment_instruments', 'payment_allocations', 'financial_events']) {
      const [privileges] = await sql(`select has_table_privilege('authenticated', $1, 'SELECT') as read,
        has_table_privilege('authenticated', $1, 'INSERT,UPDATE,DELETE') as write,
        has_table_privilege('anon', $1, 'SELECT') as anonymous`, [`public.${table}`])
      expect(privileges).toEqual({ read: true, write: false, anonymous: false })
      await withConexion(async (database) => {
        await database.query('begin')
        try {
          await database.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: snapshot.ids.staffId, role: 'authenticated' })])
          await database.query('set local role authenticated')
          expect((await database.query(`select count(*)::int as count from public.${table}`)).rows[0].count)
            .toBe((await sql(`select count(*)::int as count from public.${table}`))[0].count)
          await database.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated' })])
          expect((await database.query(`select * from public.${table}`)).rows).toEqual([])
        } finally { await database.query('rollback') }
      })
    }
  })
})

// Las operaciones nuevas se verifican contra filas realmente creadas antes de la migración.
describe.runIf(Boolean(process.env.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT))('mutaciones sobre registros financieros heredados', () => {
  beforeAll(async () => {
    snapshot ??= JSON.parse(await readFile(process.env.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT!, 'utf8'))
  })
  it('preserva metadatos, rechaza reconocimiento fabricado y clasifica solo con fecha y motivo manuales', async () => {
    await withConexion(async (database) => {
      await database.query('begin')
      try {
        const { rows: [document] } = await database.query('select * from public.documentos where id = $1', [snapshot.ids.partialOrder])
        const { rows: instruments } = await database.query(`select jsonb_build_object('id', id, 'kind', kind, 'status', status,
          'amount', amount::text, 'receivedOn', received_on, 'dueOn', due_on, 'settledOn', settled_on,
          'reference', reference, 'bank', bank) as entry from public.payment_instruments where op_id = $1 order by status`, [document.id])
        await database.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: snapshot.ids.staffId, role: 'authenticated' })])
        await database.query('set local role authenticated')
        const base = { tipo: 'orden_pago', monto: document.monto, numero: document.numero, notas: 'Edición de metadatos heredados' }
        await database.query('select public.actualizar_documento($1, $2)', [document.id, base])
        expect((await database.query('select financial_version::int from public.documentos where id = $1', [document.id])).rows)
          .toEqual([{ financial_version: 1 }])
        const entries = instruments.map(({ entry }) => entry)
        const recognized = entries.find((entry) => entry.status === 'legacy_recognized')
        const unclassified = entries.find((entry) => entry.status === 'legacy_unclassified')
        for (const forged of [
          entries.map((entry) => entry.id === recognized.id ? { ...entry, amount: '400' } : { ...entry, amount: '100' }),
          entries.map((entry) => entry.id === unclassified.id ? { ...entry, status: 'legacy_recognized' } : entry),
        ]) {
          await database.query('savepoint forged')
          await expect(database.query('select public.actualizar_documento($1, $2)', [document.id,
            { ...base, finance: { expectedVersion: 1, correctionReason: 'No autoriza fabricar cobros', paymentInstruments: forged } }]))
            .rejects.toMatchObject({ code: 'P0001' })
          await database.query('rollback to savepoint forged')
        }
        const classified = entries.map((entry) => entry.id === recognized.id ? {
          ...entry, kind: 'transfer', status: 'confirmed', settledOn: '2024-06-20',
        } : entry)
        await database.query('savepoint missing_reason')
        await expect(database.query('select public.actualizar_documento($1, $2)', [document.id,
          { ...base, finance: { expectedVersion: 1, paymentInstruments: classified } }])).rejects.toMatchObject({ code: 'P0001' })
        await database.query('rollback to savepoint missing_reason')
        await database.query('select public.actualizar_documento($1, $2)', [document.id,
          { ...base, finance: { expectedVersion: 1, correctionReason: 'Transferencia acreditada verificada manualmente', paymentInstruments: classified } }])
        await database.query('reset role')
        expect((await database.query(`select sum(money)::text as money, sum(legacy_applied)::text as legacy
          from private.financial_ledger($1) where op_id = $2`, [document.cliente_id, document.id])).rows)
          .toEqual([{ money: '300.00', legacy: '0' }])
        expect((await database.query(`select budget_id, source from public.payment_allocations where instrument_id = $1`, [recognized.id])).rows)
          .toEqual([{ budget_id: null, source: 'legacy' }])
        expect((await database.query('select financial_version::int from public.documentos where id = $1', [document.id])).rows)
          .toEqual([{ financial_version: 2 }])
      } finally { await database.query('rollback') }
    })
  })
})
