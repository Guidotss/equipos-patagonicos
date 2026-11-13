import { describe, expect, it } from 'vitest'
import { crearUser, removeUser, withConexion } from '.././helpers'

async function withFinancialFixture(
  callback: (
    database: import('pg').Client,
    documentId: string,
    invoiceId: string,
  ) => Promise<void>,
) {
  await withConexion(async (database) => {
    await database.query('begin')
    try {
      const {
        rows: [customer],
      } = await database.query(
        "insert into public.clientes(razon_social) values ('Cliente financiero sintético') returning id",
      )
      const {
        rows: [document],
      } = await database.query(
        `insert into public.documentos(cliente_id, tipo, monto)
        values ($1, 'orden_pago', 1000) returning id`,
        [customer.id],
      )
      const {
        rows: [invoice],
      } = await database.query(
        `insert into public.documentos(cliente_id, tipo, monto, tipo_comprobante)
        values ($1, 'factura', 1000, 'FA') returning id`,
        [customer.id],
      )
      await callback(database, document.id, invoice.id)
    } finally {
      await database.query('rollback')
    }
  })
}

async function rejectsConstraint(
  database: import('pg').Client,
  query: string,
  parameters: unknown[],
  code = '23514',
) {
  await database.query('savepoint invalid_input')
  try {
    await expect(database.query(query, parameters)).rejects.toMatchObject({
      code,
    })
  } finally {
    await database.query('rollback to savepoint invalid_input')
  }
}

describe('contratos del esquema financiero inicial', () => {
  it('valida estados de medios, importes y fechas efectivas sin generar cuotas', async () => {
    await withFinancialFixture(async (database, documentId) => {
      const insert = `insert into public.payment_instruments(op_id, kind, status, amount, settled_on)
        values ($1, $2, $3, $4, $5)`
      for (const [kind, status] of [
        ['cash', 'confirmed'],
        ['transfer', 'confirmed'],
        ['withholding', 'confirmed'],
        ['check', 'cleared'],
      ]) {
        await rejectsConstraint(database, insert, [
          documentId,
          kind,
          status,
          100,
          null,
        ])
        await database.query(insert, [
          documentId,
          kind,
          status,
          100,
          '2024-06-20',
        ])
      }
      for (const [kind, status] of [
        ['check', 'confirmed'],
        ['cash', 'pending'],
        ['transfer', 'cleared'],
        ['withholding', 'legacy_recognized'],
        ['legacy_unidentified', 'confirmed'],
      ]) {
        await rejectsConstraint(database, insert, [
          documentId,
          kind,
          status,
          100,
          '2024-06-20',
        ])
      }
      for (const status of [
        'legacy_recognized',
        'legacy_unclassified',
        'voided',
      ]) {
        await database.query(insert, [
          documentId,
          'legacy_unidentified',
          status,
          100,
          null,
        ])
        await rejectsConstraint(database, insert, [
          documentId,
          'legacy_unidentified',
          status,
          100,
          '2024-06-20',
        ])
      }
      for (const status of ['pending', 'rejected', 'voided'])
        await database.query(insert, [documentId, 'check', status, 100, null])
      await rejectsConstraint(database, insert, [
        documentId,
        'check',
        'pending',
        0,
        null,
      ])
      await rejectsConstraint(database, insert, [
        documentId,
        'check',
        'pending',
        'NaN',
        null,
      ])
      await database.query(
        'update public.documentos set payment_condition = $1 where id = $2',
        ['30/45/60 días según acuerdo', documentId],
      )
      expect(
        (
          await database.query(
            'select payment_condition, financial_version from public.documentos where id = $1',
            [documentId],
          )
        ).rows,
      ).toEqual([
        {
          payment_condition: '30/45/60 días según acuerdo',
          financial_version: '1',
        },
      ])
      await rejectsConstraint(
        database,
        'update public.documentos set financial_version = 0 where id = $1',
        [documentId],
      )
      await rejectsConstraint(
        database,
        "update public.documentos set tipo = 'orden_compra' where id = $1",
        [documentId],
      )
    })
  })

  it('distingue equipos asignados, sin equipo y desconocidos; preserva instantáneas sin FK al trabajo', async () => {
    await withFinancialFixture(async (database, documentId, invoiceId) => {
      const insert = `insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject,
        equipment_status, equipment_id, equipment_name, amount, historical_settled_amount, source)
        values ($1, $2, $3, $4, $5, $6, $7, 100, $8, 'explicit')`
      const budgetId = crypto.randomUUID()
      const equipment = (
        await database.query('select id, nombre from public.equipos limit 1')
      ).rows[0]
      const base = [invoiceId, budgetId, 99, 'Trabajo ya eliminado']
      await database.query(insert, [
        ...base,
        'assigned',
        equipment.id,
        equipment.nombre,
        0,
      ])
      await database.query(insert, [...base, 'none', null, null, 0])
      await database.query(insert, [
        invoiceId,
        null,
        null,
        null,
        'unknown',
        null,
        null,
        0,
      ])
      await rejectsConstraint(database, insert, [
        ...base,
        'assigned',
        null,
        null,
        0,
      ])
      await rejectsConstraint(database, insert, [
        ...base,
        'unknown',
        equipment.id,
        equipment.nombre,
        0,
      ])
      await rejectsConstraint(database, insert, [
        invoiceId,
        null,
        null,
        null,
        'none',
        null,
        null,
        0,
      ])
      await rejectsConstraint(database, insert, [
        ...base,
        'unknown',
        null,
        null,
        101,
      ])
      await rejectsConstraint(database, insert, [
        ...base,
        'unknown',
        null,
        null,
        -1,
      ])
      const {
        rows: [instrument],
      } = await database.query(
        `insert into public.payment_instruments(op_id, kind, status, amount)
        values ($1, 'legacy_unidentified', 'legacy_recognized', 100) returning id`,
        [documentId],
      )
      await rejectsConstraint(
        database,
        `insert into public.payment_allocations(instrument_id, amount, source)
        values ($1, 100, 'explicit')`,
        [instrument.id],
      )
      await database.query(
        `insert into public.payment_allocations(instrument_id, budget_id, budget_number, budget_subject, amount, source)
        values ($1, $2, 99, 'Trabajo ya eliminado', 100, 'legacy')`,
        [instrument.id, budgetId],
      )
    })
  })

  it('conserva los eventos como registros inmutables con versiones crecientes', async () => {
    await withFinancialFixture(async (database, documentId) => {
      const insert = `insert into public.financial_events(document_id, action, before_version, after_version, before_financial, after_financial)
        values ($1, 'corrección', $2, $3, '{}'::jsonb, '{}'::jsonb)`
      await rejectsConstraint(database, insert, [documentId, 1, 1])
      await rejectsConstraint(database, insert, [documentId, -1, 0])
      await database.query(insert, [documentId, 0, 1])
      await database.query(insert, [documentId, 1, 2])
      await rejectsConstraint(
        database,
        'update public.financial_events set reason = $1 where document_id = $2',
        ['Otra razón', documentId],
        '42501',
      )
      await rejectsConstraint(
        database,
        'delete from public.financial_events where document_id = $1',
        [documentId],
        '42501',
      )
      await rejectsConstraint(
        database,
        'truncate public.financial_events',
        [],
        '42501',
      )
      expect(
        (
          await database.query(`select
        has_table_privilege('service_role', 'public.financial_events', 'SELECT') as read,
        has_table_privilege('service_role', 'public.financial_events', 'INSERT') as append,
        has_table_privilege('service_role', 'public.financial_events', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as mutate`)
        ).rows,
      ).toEqual([{ read: true, append: true, mutate: false }])
      await database.query('set local role service_role')
      await database.query(insert, [documentId, 2, 3])
      expect(
        (
          await database.query(
            'select count(*)::int as count from public.financial_events where document_id = $1',
            [documentId],
          )
        ).rows,
      ).toEqual([{ count: 3 }])
      await rejectsConstraint(
        database,
        'update public.financial_events set reason = $1 where document_id = $2',
        ['Otra razón', documentId],
        '42501',
      )
      await rejectsConstraint(
        database,
        'delete from public.financial_events where document_id = $1',
        [documentId],
        '42501',
      )
      await rejectsConstraint(
        database,
        'truncate public.financial_events',
        [],
        '42501',
      )
    })
  })

  it('los gruistas y usuarios inactivos no pueden leer filas existentes del modelo nuevo', async () => {
    for (const options of [
      { activo: true, rol: 'crane_operator' as const },
      { activo: false, rol: 'operador' as const },
    ]) {
      const user = await crearUser(options)
      try {
        await withFinancialFixture(async (database, documentId, invoiceId) => {
          const {
            rows: [instrument],
          } = await database.query(
            `insert into public.payment_instruments(op_id, kind, status, amount)
            values ($1, 'legacy_unidentified', 'legacy_recognized', 100) returning id`,
            [documentId],
          )
          await database.query(
            `insert into public.invoice_allocations(invoice_id, equipment_status, amount, source)
            values ($1, 'unknown', 100, 'legacy_unallocated')`,
            [invoiceId],
          )
          await database.query(
            `insert into public.payment_allocations(instrument_id, amount, source)
            values ($1, 100, 'legacy')`,
            [instrument.id],
          )
          await database.query(
            `insert into public.financial_events(document_id, action, before_version, after_version, before_financial, after_financial)
            values ($1, 'corrección', 1, 2, '{}'::jsonb, '{}'::jsonb)`,
            [documentId],
          )
          await database.query(
            "select set_config('request.jwt.claims', $1, true)",
            [JSON.stringify({ sub: user.id, role: 'authenticated' })],
          )
          await database.query('set local role authenticated')
          for (const table of [
            'invoice_allocations',
            'payment_instruments',
            'payment_allocations',
            'financial_events',
          ]) {
            expect(
              (await database.query(`select * from public.${table}`)).rows,
            ).toEqual([])
          }
        })
      } finally {
        await removeUser(user.id)
      }
    }
  })
})
