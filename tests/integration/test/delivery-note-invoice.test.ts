import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  limpiarDocuments,
  limpiarFilesSubidos,
  newBudget,
  uploadFile,
} from '.././documents-helpers'
import {
  registerCashFixture,
  updateCashFixture,
  voidFinancialFixture,
} from '.././financial-fixtures'
import {
  anonClient,
  contraTransaccionInCurso,
  crearUser,
  removeUser,
  sql,
} from '.././helpers'

type SaveArgs =
  Database['public']['Functions']['save_delivery_note_with_invoice']['Args']

const marker = `delivery-note-invoice-${crypto.randomUUID()}`
const userIds: string[] = []
let staff: Awaited<ReturnType<typeof crearUser>>
let clientId: string
let otherClientId: string
let budgetId: string
let secondBudgetId: string
let otherBudgetId: string

async function createUser(options: Parameters<typeof crearUser>[0]) {
  const user = await crearUser(options)
  userIds.push(user.id)
  return user
}

beforeAll(async () => {
  staff = await createUser({ activo: true, rol: 'operador' })
  const [customer, otherCustomer] = await sql<{ id: string }>(
    'insert into public.clientes(razon_social) values ($1), ($2) returning id',
    [marker, `${marker}-otro`],
  )
  clientId = customer.id
  otherClientId = otherCustomer.id
  budgetId = await newBudget(staff.client, clientId, marker)
  secondBudgetId = await newBudget(staff.client, clientId, marker)
  otherBudgetId = await newBudget(staff.client, otherClientId, marker)
})

afterAll(async () => {
  try {
    await limpiarDocuments(marker)
    await limpiarFilesSubidos()
    await sql('delete from public.clientes where id = any($1::uuid[])', [
      [clientId, otherClientId],
    ])
  } finally {
    for (const userId of userIds) await removeUser(userId)
  }
})

type RegisterOptions = {
  customerId?: string
  budgets?: string[]
  deliveryNotes?: string[]
  applications?: Json[]
}

async function registerDocument(
  fields: Record<string, Json>,
  {
    customerId = clientId,
    budgets = [budgetId],
    deliveryNotes = [],
    applications = [],
  }: RegisterOptions = {},
) {
  const file = await uploadFile(staff.client, customerId)
  const { data, error } = await registerCashFixture(staff.client, {
    p_datos: { cliente_id: customerId, notas: marker, ...fields },
    p_presupuestos: budgets,
    p_archivos: [file],
    p_remitos: deliveryNotes,
    p_aplicaciones: applications,
  })
  if (error) throw error
  return data
}

function registerInvoice(options?: RegisterOptions, invoiceType = 'FA') {
  return registerDocument(
    { tipo: 'factura', monto: '1000', tipo_comprobante: invoiceType },
    options,
  )
}

function deliveryNoteData(fields: Record<string, Json> = {}) {
  return { tipo: 'remito', cliente_id: clientId, notas: marker, ...fields }
}

function saveDeliveryNote(invoiceId: string, args: Partial<SaveArgs> = {}) {
  return staff.client.rpc('save_delivery_note_with_invoice', {
    p_datos: deliveryNoteData(),
    p_presupuestos: [budgetId],
    p_archivos: [],
    p_factura_id: invoiceId,
    ...args,
  })
}

function readFinance(invoiceId: string, paymentOrderId: string) {
  return sql(
    `select d.id, d.financial_version, f.cobrado, f.saldo, private.financial_snapshot(d.id) as snapshot,
    (select count(*) from public.financial_events e where e.document_id = d.id) as events
    from public.documentos d left join public.v_facturas f on f.id = d.id
    where d.id = any($1::uuid[]) order by d.id`,
    [[invoiceId, paymentOrderId]],
  )
}

describe('save_delivery_note_with_invoice', () => {
  it('agrega un remito nuevo y otro editado sin tocar los vínculos previos ni los importes', async () => {
    const previousId = await registerDocument({ tipo: 'remito' })
    const invoiceId = await registerInvoice({ deliveryNotes: [previousId] })
    const paymentOrderId = await registerDocument(
      { tipo: 'orden_pago', monto: '250' },
      {
        applications: [{ factura_id: invoiceId, monto_aplicado: '250' }],
      },
    )
    const financeBefore = await readFinance(invoiceId, paymentOrderId)
    expect(
      financeBefore.find((document) => document.id === invoiceId),
    ).toMatchObject({ cobrado: '250.00', saldo: '750.00' })

    const newFile = await uploadFile(staff.client, clientId)
    const created = await saveDeliveryNote(invoiceId, {
      p_archivos: [newFile],
    })
    expect(created.error).toBeNull()

    const editedId = await registerDocument({ tipo: 'remito', monto: '20' })
    const [oldFile] = await sql<{ id: string }>(
      'select id from public.documento_archivos where documento_id = $1',
      [editedId],
    )
    const replacement = await uploadFile(
      staff.client,
      clientId,
      'Remito corregido.pdf',
    )
    const edited = await saveDeliveryNote(invoiceId, {
      p_id: editedId,
      p_datos: deliveryNoteData({ numero: 'R-corregido', monto: '20' }),
      p_archivos: [replacement],
      p_quitar: [oldFile.id],
    })
    expect(edited.error).toBeNull()
    expect(edited.data).toBe(editedId)
    expect(
      await sql('select id from public.documentos where factura_id = $1', [
        invoiceId,
      ]),
    ).toEqual(
      expect.arrayContaining([
        { id: previousId },
        { id: created.data },
        { id: editedId },
      ]),
    )
    expect(
      await sql('select numero, monto from public.documentos where id = $1', [
        editedId,
      ]),
    ).toEqual([{ numero: 'R-corregido', monto: '20.00' }])
    expect(
      await sql(
        'select path from public.documento_archivos where documento_id = $1',
        [created.data],
      ),
    ).toEqual([{ path: newFile.path }])
    expect(
      await sql(
        'select path from public.documento_archivos where documento_id = $1',
        [editedId],
      ),
    ).toEqual([{ path: replacement.path }])
    expect(await readFinance(invoiceId, paymentOrderId)).toEqual(financeBefore)
  })

  it('exige una factura vigente del cliente que cubra todos los presupuestos seleccionados', async () => {
    const invoiceId = await registerInvoice()
    const voidedId = await registerInvoice()
    const creditNoteId = await registerInvoice(undefined, 'NC')
    const foreignInvoiceId = await registerInvoice({
      customerId: otherClientId,
      budgets: [otherBudgetId],
    })
    expect(
      (
        await voidFinancialFixture(staff.client, 'anular_documento', {
          p_id: voidedId,
        })
      ).error,
    ).toBeNull()
    const file = await uploadFile(staff.client, clientId)

    for (const invalidInvoiceId of [voidedId, creditNoteId, foreignInvoiceId]) {
      expect(
        (await saveDeliveryNote(invalidInvoiceId, { p_archivos: [file] })).error
          ?.message,
      ).toMatch(/factura vigente del mismo cliente/)
    }
    for (const budgets of [[secondBudgetId], [budgetId, secondBudgetId]]) {
      expect(
        (
          await saveDeliveryNote(invoiceId, {
            p_archivos: [file],
            p_presupuestos: budgets,
          })
        ).error?.message,
      ).toMatch(/todos los presupuestos seleccionados/)
    }
    expect(
      (
        await saveDeliveryNote(invoiceId, {
          p_archivos: [file],
          p_presupuestos: [],
        })
      ).error?.message,
    ).toMatch(/al menos un presupuesto/)
    expect(
      await sql('select id from public.documento_archivos where path = $1', [
        file.path,
      ]),
    ).toEqual([])

    const sharedInvoiceId = await registerInvoice({
      budgets: [budgetId, secondBudgetId],
    })
    const saved = await saveDeliveryNote(sharedInvoiceId, {
      p_archivos: [file],
      p_presupuestos: [budgetId, secondBudgetId],
    })
    expect(saved.error).toBeNull()
    const links = await sql<{ cotizacion_id: string }>(
      'select cotizacion_id from public.documento_presupuestos where documento_id = $1',
      [saved.data],
    )
    expect(links.map((link) => link.cotizacion_id).sort()).toEqual(
      [budgetId, secondBudgetId].sort(),
    )
  })

  it('solo edita remitos vigentes del cliente y reemplaza vínculos únicamente cuando la factura anterior está anulada', async () => {
    const linkedId = await registerDocument({ tipo: 'remito' })
    const voidedId = await registerDocument({ tipo: 'remito' })
    const foreignId = await registerDocument(
      { tipo: 'remito' },
      { customerId: otherClientId, budgets: [otherBudgetId] },
    )
    expect(
      (await staff.client.rpc('anular_documento', { p_id: voidedId })).error,
    ).toBeNull()
    const currentInvoiceId = await registerInvoice({
      deliveryNotes: [linkedId],
    })
    const nextInvoiceId = await registerInvoice()

    for (const invalidId of [voidedId, foreignId, currentInvoiceId]) {
      expect(
        (await saveDeliveryNote(nextInvoiceId, { p_id: invalidId })).error
          ?.message,
      ).toMatch(/El remito no existe, está anulado o es de otro cliente/)
    }
    expect(
      (await saveDeliveryNote(currentInvoiceId, { p_id: linkedId })).error,
    ).toBeNull()
    expect(
      (await saveDeliveryNote(nextInvoiceId, { p_id: linkedId })).error
        ?.message,
    ).toMatch(/otra factura vigente/)
    expect(
      await sql('select factura_id from public.documentos where id = $1', [
        linkedId,
      ]),
    ).toEqual([{ factura_id: currentInvoiceId }])

    expect(
      (
        await voidFinancialFixture(staff.client, 'anular_documento', {
          p_id: currentInvoiceId,
        })
      ).error,
    ).toBeNull()
    const replaced = await saveDeliveryNote(nextInvoiceId, { p_id: linkedId })
    expect(replaced.error).toBeNull()
    expect(replaced.data).toBe(linkedId)
    expect(
      await sql('select factura_id from public.documentos where id = $1', [
        linkedId,
      ]),
    ).toEqual([{ factura_id: nextInvoiceId }])
  })

  it('revierte datos y archivos cuando falla el guardado', async () => {
    const invoiceId = await registerInvoice({
      budgets: [budgetId, secondBudgetId],
    })
    const created = await saveDeliveryNote(invoiceId, {
      p_datos: deliveryNoteData({ numero: 'R-alta-fallida' }),
    })
    expect(created.error?.message).toMatch(/al menos un archivo/)
    expect(
      await sql(
        'select id from public.documentos where notas = $1 and numero = $2',
        [marker, 'R-alta-fallida'],
      ),
    ).toEqual([])

    const editedId = await registerDocument({
      tipo: 'remito',
      numero: 'R-original',
    })
    const oldFiles = await sql(
      'select path from public.documento_archivos where documento_id = $1',
      [editedId],
    )
    const file = await uploadFile(staff.client, clientId)
    const edited = await saveDeliveryNote(invoiceId, {
      p_id: editedId,
      p_datos: deliveryNoteData({ numero: 'R-cambio-fallido' }),
      p_presupuestos: [secondBudgetId],
      p_archivos: [file],
      p_quitar: [crypto.randomUUID()],
    })
    expect(edited.error?.message).toMatch(
      /El archivo no pertenece al documento/,
    )
    expect(
      await sql(
        'select numero, factura_id from public.documentos where id = $1',
        [editedId],
      ),
    ).toEqual([{ numero: 'R-original', factura_id: null }])
    expect(
      await sql(
        'select cotizacion_id from public.documento_presupuestos where documento_id = $1',
        [editedId],
      ),
    ).toEqual([{ cotizacion_id: budgetId }])
    expect(
      await sql(
        'select path from public.documento_archivos where documento_id = $1',
        [editedId],
      ),
    ).toEqual(oldFiles)
  })

  it('serializa dos ediciones del mismo remito y conserva el primer vínculo', async () => {
    const deliveryNoteId = await registerDocument({ tipo: 'remito' })
    const firstInvoiceId = await registerInvoice()
    const secondInvoiceId = await registerInvoice()
    const result = await contraTransaccionInCurso(
      staff.id,
      'select public.save_delivery_note_with_invoice($1, $2, $3, $4, $5)',
      [
        JSON.stringify(deliveryNoteData()),
        [budgetId],
        '[]',
        firstInvoiceId,
        deliveryNoteId,
      ],
      () => saveDeliveryNote(secondInvoiceId, { p_id: deliveryNoteId }),
    )
    expect(result.error?.message).toMatch(/otra factura vigente/)
    expect(
      await sql('select factura_id from public.documentos where id = $1', [
        deliveryNoteId,
      ]),
    ).toEqual([{ factura_id: firstInvoiceId }])
  })

  it('valida el vínculo actual al editar presupuestos y nunca restablece una factura sin elección', async () => {
    const deliveryNoteId = await registerDocument({ tipo: 'remito' })
    const invoiceId = await registerInvoice()
    const editWithoutChoosing = () =>
      staff.client.rpc('save_delivery_note_with_invoice', {
        p_id: deliveryNoteId,
        p_datos: deliveryNoteData(),
        p_presupuestos: [secondBudgetId],
        p_archivos: [],
      })

    expect(
      (await saveDeliveryNote(invoiceId, { p_id: deliveryNoteId })).error,
    ).toBeNull()
    expect((await editWithoutChoosing()).error?.message).toMatch(
      /todos los presupuestos seleccionados/,
    )
    expect(
      await sql(
        'select cotizacion_id from public.documento_presupuestos where documento_id = $1',
        [deliveryNoteId],
      ),
    ).toEqual([{ cotizacion_id: budgetId }])

    const detached = await updateCashFixture(staff.client, {
      p_id: invoiceId,
      p_datos: {
        tipo: 'factura',
        monto: '1000',
        tipo_comprobante: 'FA',
        notas: marker,
      },
      p_remitos: [],
    })
    expect(detached.error).toBeNull()
    expect((await editWithoutChoosing()).error).toBeNull()
    expect(
      await sql('select factura_id from public.documentos where id = $1', [
        deliveryNoteId,
      ]),
    ).toEqual([{ factura_id: null }])
    expect(
      await sql(
        'select cotizacion_id from public.documento_presupuestos where documento_id = $1',
        [deliveryNoteId],
      ),
    ).toEqual([{ cotizacion_id: secondBudgetId }])
  })

  it('reserva la operación al personal activo y exige datos de remito', async () => {
    const invoiceId = await registerInvoice()
    const inactive = await createUser({ activo: false, rol: 'operador' })
    const craneOperator = await createUser({
      activo: true,
      rol: 'crane_operator',
    })
    const args = {
      p_datos: deliveryNoteData(),
      p_presupuestos: [budgetId],
      p_archivos: [],
      p_factura_id: invoiceId,
    }
    for (const client of [
      anonClient(),
      inactive.client,
      craneOperator.client,
    ]) {
      expect(
        (await client.rpc('save_delivery_note_with_invoice', args)).error?.code,
      ).toBe('42501')
    }
    expect(
      (
        await saveDeliveryNote(invoiceId, {
          p_datos: deliveryNoteData({ tipo: 'factura' }),
        })
      ).error?.message,
    ).toMatch(/tiene que ser un remito/)
    expect(
      (
        await saveDeliveryNote(invoiceId, {
          p_datos: deliveryNoteData({ cliente_id: null }),
        })
      ).error?.message,
    ).toMatch(/Falta el cliente/)
    expect(
      (
        await saveDeliveryNote(invoiceId, {
          p_datos: deliveryNoteData({ finance: {} }),
        })
      ).error?.message,
    ).toMatch(/no admite datos financieros/)
  })
})
