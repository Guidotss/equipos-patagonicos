// tests/integration/documentos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsOfExample } from './quotes-helpers'
import { limpiarDocuments, newBudget } from './documents-helpers'
import { removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  ids = await idsOfExample()
})

afterAll(async () => {
  await limpiarDocuments(MARCA)
  for (const u of [activo, inactivo]) await removeUser(u.id)
})

async function insert(fields: Record<string, unknown>) {
  const columns = Object.keys(fields)
  const [row] = await sql<{ id: string; numero_normalizado: string }>(
    `insert into public.documentos (${columns.join(', ')}, notas)
     values (${columns.map((_, i) => `$${i + 1}`).join(', ')}, $${columns.length + 1})
     returning id, numero_normalizado`,
    [...Object.values(fields), MARCA],
  )
  return row
}

describe('documentos', () => {
  it('la app solo lee: insert directo rechazado', async () => {
    const { error } = await activo.client.from('documentos').insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo los ve; uno inactivo no', async () => {
    const { id } = await insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect((await activo.client.from('documentos').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await inactivo.client.from('documentos').select('id').eq('id', id)).data).toEqual([])
  })

  it('normaliza el número para buscar', async () => {
    const { numero_normalizado } = await insert({ cliente_id: ids.cliente_id, tipo: 'remito', numero: '0001-00012345' })
    expect(numero_normalizado).toBe('100012345')
  })

  it('factura y orden de pago exigen monto; la factura, tipo de comprobante', async () => {
    await expect(insert({ cliente_id: ids.cliente_id, tipo: 'orden_pago' })).rejects.toThrow(/documentos_monto_requerido/)
    await expect(insert({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100 })).rejects.toThrow(/documentos_comprobante_requerido/)
    await expect(insert({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })).resolves.toBeTruthy()
  })

  it('los campos de factura y de remito no se mezclan', async () => {
    await expect(insert({ cliente_id: ids.cliente_id, tipo: 'remito', tipo_comprobante: 'FA' })).rejects.toThrow(/documentos_campos_de_factura/)
    await expect(insert({ cliente_id: ids.cliente_id, tipo: 'orden_compra', periodo_desde: '2026-10-01' })).rejects.toThrow(/documentos_campos_de_remito/)
    await expect(
      insert({ cliente_id: ids.cliente_id, tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }),
    ).rejects.toThrow(/documentos_periodo/)
  })

  it('un documento solo se vincula a presupuestos aprobados del mismo cliente', async () => {
    const budget = await newBudget(activo.client, ids.cliente_id, MARCA)
    const otroClient = await newBudget(activo.client, ids.client_with_contact_id, MARCA)
    const { id } = await insert({ cliente_id: ids.cliente_id, tipo: 'orden_compra' })

    await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, budget])
    await expect(
      sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, otroClient]),
    ).rejects.toThrow(/mismo cliente/)
  })

  it('un remito solo apunta a una factura de su cliente; una OP solo cancela facturas', async () => {
    const invoice = await insert({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const invoiceOtro = await insert({ cliente_id: ids.client_with_contact_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const deliveryNote = await insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    const op = await insert({ cliente_id: ids.cliente_id, tipo: 'orden_pago', monto: 100 })

    await sql('update public.documentos set factura_id = $1 where id = $2', [invoice.id, deliveryNote.id])
    await expect(sql('update public.documentos set factura_id = $1 where id = $2', [invoiceOtro.id, deliveryNote.id])).rejects.toThrow(/mismo cliente/)

    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, invoice.id])
    await expect(
      sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, deliveryNote.id]),
    ).rejects.toThrow(/solo cancela facturas/)
  })
})

describe('cambios en un documento del que dependen otros', () => {
  const changeClient = (id: string) =>
    sql('update public.documentos set cliente_id = $1 where id = $2', [ids.client_with_contact_id, id])

  it('una factura con órdenes de pago aplicadas no pasa a nota de crédito ni cambia de cliente; la OP tampoco', async () => {
    const invoice = await insert({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const op = await insert({ cliente_id: ids.cliente_id, tipo: 'orden_pago', monto: 100 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, invoice.id])

    await expect(sql(`update public.documentos set tipo_comprobante = 'NC' where id = $1`, [invoice.id])).rejects.toThrow(
      /órdenes de pago aplicadas/,
    )
    await expect(changeClient(invoice.id)).rejects.toThrow(/órdenes de pago aplicadas/)
    await expect(changeClient(op.id)).rejects.toThrow(/cancela facturas/)
    await expect(sql(`update public.documentos set tipo_comprobante = 'FCE_A' where id = $1`, [invoice.id])).resolves.toEqual([])
  })

  it('una factura que cubre remitos sigue siendo factura del mismo cliente', async () => {
    const invoice = await insert({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const deliveryNote = await insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    await sql('update public.documentos set factura_id = $1 where id = $2', [invoice.id, deliveryNote.id])

    await expect(
      sql(`update public.documentos set tipo = 'orden_compra', monto = null, tipo_comprobante = null where id = $1`, [invoice.id]),
    ).rejects.toThrow(/cubre remitos/)
    await expect(changeClient(invoice.id)).rejects.toThrow(/cubre remitos/)
  })

  it('un documento no pasa a otro cliente que el de sus presupuestos', async () => {
    const budget = await newBudget(activo.client, ids.cliente_id, MARCA)
    const { id } = await insert({ cliente_id: ids.cliente_id, tipo: 'orden_compra' })
    await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, budget])

    await expect(changeClient(id)).rejects.toThrow(/presupuestos de otro cliente/)
  })

  it('un anulado vuelve solo si sigue vinculado a presupuestos aprobados', async () => {
    const budget = await newBudget(activo.client, ids.cliente_id, MARCA)
    const { id } = await insert({ cliente_id: ids.cliente_id, tipo: 'orden_compra' })
    await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, budget])
    const anular = () => sql('update public.documentos set deleted_at = now() where id = $1', [id])
    const restore = () => sql('update public.documentos set deleted_at = null where id = $1', [id])

    await anular()
    await expect(restore()).resolves.toEqual([])

    await anular()
    await sql(
      `update public.cotizaciones set estado = 'borrador', fecha_aprobacion = null, presupuesto_estado = null where id = $1`,
      [budget],
    )
    await expect(restore()).rejects.toThrow(/No se puede restaurar/)

    await sql('delete from public.cotizaciones where id = $1', [budget])
    await expect(restore()).rejects.toThrow(/No se puede restaurar/)
  })
})
