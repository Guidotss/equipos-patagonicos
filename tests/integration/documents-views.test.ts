// tests/integration/documentos-vistas.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsOfExample } from './quotes-helpers'
import { limpiarDocuments, newBudget } from './documents-helpers'
import { removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
})

afterAll(async () => {
  await limpiarDocuments(MARCA)
  await removeUser(activo.id)
})

async function document(budget: string, fields: Record<string, unknown>) {
  const columns = Object.keys(fields)
  const [row] = await sql<{ id: string }>(
    `insert into public.documentos (cliente_id, ${columns.join(', ')}, notas)
     values ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')}, $${columns.length + 2}) returning id`,
    [ids.cliente_id, ...Object.values(fields), MARCA],
  )
  await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [row.id, budget])
  return row.id
}

async function budgetInView(id: string) {
  const { data, error } = await activo.client.from('v_presupuestos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

async function invoiceInView(id: string) {
  const { data, error } = await activo.client.from('v_facturas').select('saldo, estado_cobro').eq('id', id).single()
  if (error) throw error
  return { saldo: Number(data.saldo), estado_cobro: data.estado_cobro }
}

describe('v_facturas y v_presupuestos', () => {
  it('cuenta documentos por tipo y remitos sin factura, sin contar anulados', async () => {
    const p = await newBudget(activo.client, ids.cliente_id, MARCA)
    await document(p, { tipo: 'orden_compra' })
    const remito1 = await document(p, { tipo: 'remito' })
    await document(p, { tipo: 'remito' })
    const voided = await document(p, { tipo: 'remito' })
    await sql('update public.documentos set deleted_at = now() where id = $1', [voided])
    const invoice = await document(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await sql('update public.documentos set factura_id = $1 where id = $2', [invoice, remito1])

    const view = await budgetInView(p)
    expect(view).toMatchObject({ ordenes_compra: 1, remitos: 2, facturas: 1, ordenes_pago: 0, remitos_sin_factura: 1 })
    expect(Number(view.facturado)).toBe(1000)
    expect(Number(view.saldo)).toBe(1000)
  })

  it('el saldo baja con cada orden de pago y una OP anulada no cuenta', async () => {
    const p = await newBudget(activo.client, ids.cliente_id, MARCA)
    const invoice = await document(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA', fecha_vencimiento: '2020-01-01' })
    expect(await invoiceInView(invoice)).toEqual({ saldo: 1000, estado_cobro: 'vencida' })

    const op1 = await document(p, { tipo: 'orden_pago', monto: 400 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 400)', [op1, invoice])
    expect(await invoiceInView(invoice)).toEqual({ saldo: 600, estado_cobro: 'parcial' })

    const op2 = await document(p, { tipo: 'orden_pago', monto: 600 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 600)', [op2, invoice])
    expect(await invoiceInView(invoice)).toEqual({ saldo: 0, estado_cobro: 'cobrada' })

    await sql('update public.documentos set deleted_at = now() where id = $1', [op2])
    expect(await invoiceInView(invoice)).toEqual({ saldo: 600, estado_cobro: 'parcial' })
    expect(Number((await budgetInView(p)).saldo)).toBe(600)
  })

  it('una nota de crédito no suma al facturado ni tiene saldo', async () => {
    const p = await newBudget(activo.client, ids.cliente_id, MARCA)
    await document(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await document(p, { tipo: 'factura', monto: 200, tipo_comprobante: 'NC' })
    const view = await budgetInView(p)
    expect(view.facturas).toBe(2)
    expect(Number(view.facturado)).toBe(1000)
    expect(Number(view.saldo)).toBe(1000)
  })

  it('solo muestra cotizaciones aprobadas', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas) values ($1, 'jornada', $2) returning id`,
      [ids.cliente_id, MARCA],
    )
    const { data } = await activo.client.from('v_presupuestos').select('id').eq('id', id)
    expect(data).toEqual([])
  })
})
