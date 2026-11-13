import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FinanceInput } from '@/lib/finance/contracts'
import { parseAggregateCents } from '@/lib/finance/amounts'
import {
  readEquipmentRevenue,
  readEquipmentRevenueQuery,
} from '@/lib/finance/report'
import {
  limpiarDocuments,
  limpiarFilesSubidos,
  newBudget,
  uploadFile,
} from './documents-helpers'
import { anonClient, crearUser, removeUser, sql, withConexion } from './helpers'

const marker = `facturacion-grua-${crypto.randomUUID()}`
const from = '2037-10-01'
const to = '2037-10-31'
const query = readEquipmentRevenueQuery({ desde: from, hasta: to })
type TestUser = Awaited<ReturnType<typeof crearUser>>
let staff: TestUser
let customer: string
let craneA: string
let craneB: string
let firstJob: string
let secondJob: string
let thirdJob: string
let needsReview: string
let undatedInvoice: string

function allocation(
  amount: string,
  budgetId: string | null,
  equipmentStatus: 'assigned' | 'none' | 'unknown',
  equipmentId: string | null = null,
) {
  return {
    amount,
    budgetId,
    equipmentStatus,
    equipmentId,
    historicalSettledAmount: '0',
  }
}

async function invoice(
  amount: string,
  issuedOn: string | null,
  invoiceAllocations: NonNullable<FinanceInput['invoiceAllocations']>,
  type = 'FA',
) {
  const file = await uploadFile(staff.client, customer)
  const budgets = invoiceAllocations.flatMap((entry) =>
    entry.budgetId ? [entry.budgetId] : [],
  )
  const { data, error } = await staff.client.rpc('registrar_documento', {
    p_datos: {
      cliente_id: customer,
      tipo: 'factura',
      numero: `FA-${crypto.randomUUID()}`,
      fecha: issuedOn,
      tipo_comprobante: type,
      monto: amount,
      notas: marker,
      finance: { invoiceAllocations },
    },
    p_presupuestos: [...new Set(budgets)],
    p_archivos: [file],
  })
  if (error) throw error
  return data
}

beforeAll(async () => {
  staff = await crearUser({ activo: true, rol: 'operador' })
  customer = (
    await sql<{ id: string }>(
      'insert into public.clientes(razon_social) values ($1) returning id',
      [marker],
    )
  )[0].id
  craneA = (
    await sql<{ id: string }>(
      'insert into public.equipos(nombre) values ($1) returning id',
      [`${marker} A original`],
    )
  )[0].id
  craneB = (
    await sql<{ id: string }>(
      'insert into public.equipos(nombre) values ($1) returning id',
      [`${marker} B`],
    )
  )[0].id
  firstJob = await newBudget(staff.client, customer, marker)
  secondJob = await newBudget(staff.client, customer, marker)
  thirdJob = await newBudget(staff.client, customer, marker)

  await invoice('1000', from, [
    allocation('600', firstJob, 'assigned', craneA),
    allocation('400', secondJob, 'assigned', craneB),
  ])
  await sql('update public.equipos set nombre = $2 where id = $1', [
    craneA,
    `${marker} A renombrada`,
  ])
  await invoice('500', to, [allocation('500', firstJob, 'assigned', craneA)])
  await invoice('200', '2037-10-17', [allocation('200', secondJob, 'none')])
  needsReview = await invoice('300', '2037-10-21', [
    allocation('80', firstJob, 'unknown'),
    allocation('120', thirdJob, 'unknown'),
    allocation('100', null, 'unknown'),
  ])
  undatedInvoice = await invoice('400', null, [
    allocation('200.01', firstJob, 'assigned', craneA),
    allocation('199.99', null, 'unknown'),
  ])
  await invoice('0.01', '2037-09-30', [
    allocation('0.01', firstJob, 'assigned', craneA),
  ])
  await invoice(
    '3000',
    '2037-10-22',
    [allocation('3000', firstJob, 'unknown')],
    'NC',
  )
  const voided = await invoice('4000', '2037-10-23', [
    allocation('4000', null, 'unknown'),
  ])
  const { error } = await staff.client.rpc('anular_documento', {
    p_id: voided,
    p_expected_version: 1,
    p_reason: 'Excluir factura de prueba',
  })
  if (error) throw error

  // Simula una reasignación posterior en datos de prueba, sin modificar la protección del presupuesto aprobado.
  await withConexion(async (database) => {
    await database.query('begin')
    await database.query('set local session_replication_role = replica')
    await database.query(
      'update public.cotizaciones set equipo_id = $2 where id = $1',
      [firstJob, craneB],
    )
    await database.query('commit')
  })
  await sql('update public.equipos set activo = false where id = $1', [craneA])
})

afterAll(async () => {
  try {
    await limpiarDocuments(marker)
    await limpiarFilesSubidos()
    if (customer)
      await sql('delete from public.clientes where id = $1', [customer])
    await sql('delete from public.equipos where id = any($1::uuid[])', [
      [craneA, craneB].filter(Boolean),
    ])
  } finally {
    if (staff) await removeUser(staff.id)
  }
})

describe('facturación según la distribución explícita de factura', () => {
  it('suma IVA con fecha de factura inclusiva, cuenta facturas únicas y conserva grúas inactivas', async () => {
    const report = await readEquipmentRevenue(staff.client, query)
    expect(report).toEqual({
      kind: 'summary',
      period: { amount: '2000.00', invoiceCount: 4 },
      undated: { amount: '400.00', invoiceCount: 1 },
      groups: [
        {
          category: 'assigned',
          equipmentId: craneA,
          equipmentName: `${marker} A renombrada`,
          active: false,
          amount: '1100.00',
          invoiceCount: 2,
        },
        {
          category: 'assigned',
          equipmentId: craneB,
          equipmentName: `${marker} B`,
          active: true,
          amount: '400.00',
          invoiceCount: 1,
        },
        {
          category: 'none',
          equipmentId: null,
          equipmentName: null,
          active: null,
          amount: '200.00',
          invoiceCount: 1,
        },
        {
          category: 'unknown',
          equipmentId: null,
          equipmentName: null,
          active: null,
          amount: '200.00',
          invoiceCount: 1,
        },
        {
          category: 'unallocated',
          equipmentId: null,
          equipmentName: null,
          active: null,
          amount: '100.00',
          invoiceCount: 1,
        },
      ],
    })
    const snapshots = await sql<{ equipment_name: string }>(
      `select distinct a.equipment_name
      from public.invoice_allocations a where a.equipment_id = $1 order by 1`,
      [craneA],
    )
    expect(snapshots.map((entry) => entry.equipment_name)).toEqual([
      `${marker} A original`,
      `${marker} A renombrada`,
    ])

    const before = await readEquipmentRevenue(
      staff.client,
      readEquipmentRevenueQuery({ desde: '2037-09-30', hasta: '2037-09-30' }),
    )
    expect(
      before.kind === 'summary' && parseAggregateCents(before.period.amount),
    ).toBe(BigInt(1))
    const empty = await readEquipmentRevenue(
      staff.client,
      readEquipmentRevenueQuery({ desde: '2037-11-01', hasta: '2037-11-02' }),
    )
    expect(empty).toEqual({
      kind: 'summary',
      period: { amount: '0', invoiceCount: 0 },
      undated: { amount: '400.00', invoiceCount: 1 },
      groups: [],
    })
  })

  it('revisa una sola vez cada factura en su categoría y mantiene importes y fechas del alcance', async () => {
    for (const [review, id, amount, issuedOn] of [
      ['unknown', needsReview, '200.00', '2037-10-21'],
      ['unallocated', needsReview, '100.00', '2037-10-21'],
      ['undated', undatedInvoice, '400.00', null],
    ] as const) {
      const report = await readEquipmentRevenue(staff.client, {
        ...query,
        review,
      })
      expect(report).toMatchObject({
        kind: 'review',
        category: review,
        total: 1,
        page: 1,
        invoices: [{ id, amount, issuedOn }],
      })
      if (report.kind !== 'review') throw new Error('Se esperaba una revisión')
      expect(report.invoices).toHaveLength(1)
      expect(
        await sql(
          'select id, numero from public.documentos where id = $1 and deleted_at is null',
          [report.invoices[0].id],
        ),
      ).toEqual([{ id, numero: report.invoices[0].number }])
    }
    const excluded = await readEquipmentRevenue(staff.client, {
      ...query,
      from,
      to: '2037-10-20',
      review: 'unknown',
    })
    expect(excluded).toMatchObject({ kind: 'review', total: 0, invoices: [] })
    const undatedWithEmptyPeriod = await readEquipmentRevenue(staff.client, {
      ...query,
      from: '2037-11-01',
      to: '2037-11-02',
      review: 'undated',
    })
    expect(undatedWithEmptyPeriod).toMatchObject({
      total: 1,
      invoices: [{ id: undatedInvoice, issuedOn: null }],
    })
  })

  it('pagina con desempate por identificador, conserva un total exacto y evita duplicados', async () => {
    const day = '2038-10-01'
    const inserted = await sql<{ invoice_id: string }>(
      `
      with invoices as (
        insert into public.documentos(cliente_id, tipo, numero, fecha, monto, tipo_comprobante, notas)
        select $1, 'factura', 'FA-PAG-' || n, $2, 0.01, 'FA', $3 from generate_series(1, 26) n returning id
      )
      insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject, equipment_status, amount, source)
      select i.id, c.id, c.numero, c.asunto, 'unknown', 0.01, 'explicit'
      from invoices i cross join public.cotizaciones c where c.id = $4 returning invoice_id
    `,
      [customer, day, marker, thirdJob],
    )
    const params = readEquipmentRevenueQuery({
      desde: day,
      hasta: day,
      revisar: 'unknown',
    })
    const [first, second] = await Promise.all([
      readEquipmentRevenue(staff.client, params),
      readEquipmentRevenue(staff.client, { ...params, page: 2 }),
    ])
    expect(first).toMatchObject({
      kind: 'review',
      page: 1,
      total: 26,
      pageSize: 25,
    })
    expect(second).toMatchObject({ kind: 'review', page: 2, total: 26 })
    if (first.kind !== 'review' || second.kind !== 'review')
      throw new Error('Se esperaban dos páginas')
    expect(first.invoices).toHaveLength(25)
    expect(second.invoices).toHaveLength(1)
    const seen = [...first.invoices, ...second.invoices].map(({ id }) => id)
    expect(new Set(seen).size).toBe(26)
    expect(seen).toEqual(inserted.map(({ invoice_id }) => invoice_id).sort())
    expect(
      await readEquipmentRevenue(staff.client, { ...params, page: 1000 }),
    ).toEqual(second)
    expect(
      await readEquipmentRevenue(staff.client, { ...params, review: null }),
    ).toMatchObject({ period: { amount: '0.26', invoiceCount: 26 } })
  })

  it('habilita solo a administración activa y comprueba permisos antes del rango', async () => {
    const accounts: TestUser[] = []
    try {
      const admin = await crearUser({ activo: true, rol: 'admin' })
      accounts.push(admin)
      const worker = await crearUser({ activo: true, rol: 'crane_operator' })
      accounts.push(worker)
      const inactive = await crearUser({ activo: false, rol: 'admin' })
      accounts.push(inactive)
      expect(await readEquipmentRevenue(admin.client, query)).toEqual(
        await readEquipmentRevenue(staff.client, query),
      )

      const malformed = { p_from: '2037-02-30', p_review: 'invalid' }
      for (const client of [worker.client, inactive.client]) {
        const response = await client.rpc('read_equipment_revenue', malformed)
        expect(response).toMatchObject({
          data: null,
          error: { code: '42501' },
        })
      }
      const anonymous = await anonClient().rpc(
        'read_equipment_revenue',
        malformed,
      )
      expect(anonymous.data).toBeNull()
      expect(['42501', 'PGRST202']).toContain(anonymous.error?.code)
      expect(
        (await staff.client.rpc('read_equipment_revenue', malformed)).error
          ?.message,
      ).toBe('Fecha financiera inválida')
      expect(
        (
          await staff.client.rpc('read_equipment_revenue', {
            p_from: to,
            p_to: from,
          })
        ).error?.message,
      ).toContain('Desde debe ser anterior')

      expect(
        await sql(`select
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        p.provolatile, p.prosecdef, p.proconfig
        from pg_proc p where p.oid = 'public.read_equipment_revenue(text,text,text,integer)'::regprocedure`),
      ).toEqual([
        {
          anon: false,
          authenticated: true,
          provolatile: 's',
          prosecdef: true,
          proconfig: ['search_path=""'],
        },
      ])
    } finally {
      await Promise.all(accounts.map((account) => removeUser(account.id)))
    }
  })
})
