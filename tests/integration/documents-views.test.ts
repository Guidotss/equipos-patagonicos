// tests/integration/documentos-vistas.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

async function documento(presupuesto: string, campos: Record<string, unknown>) {
  const columnas = Object.keys(campos)
  const [fila] = await sql<{ id: string }>(
    `insert into public.documentos (cliente_id, ${columnas.join(', ')}, notas)
     values ($1, ${columnas.map((_, i) => `$${i + 2}`).join(', ')}, $${columnas.length + 2}) returning id`,
    [ids.cliente_id, ...Object.values(campos), MARCA],
  )
  await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [fila.id, presupuesto])
  return fila.id
}

async function presupuestoEnVista(id: string) {
  const { data, error } = await activo.client.from('v_presupuestos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

async function facturaEnVista(id: string) {
  const { data, error } = await activo.client.from('v_facturas').select('saldo, estado_cobro').eq('id', id).single()
  if (error) throw error
  return { saldo: Number(data.saldo), estado_cobro: data.estado_cobro }
}

describe('v_facturas y v_presupuestos', () => {
  it('cuenta documentos por tipo y remitos sin factura, sin contar anulados', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await documento(p, { tipo: 'orden_compra' })
    const remito1 = await documento(p, { tipo: 'remito' })
    await documento(p, { tipo: 'remito' })
    const anulado = await documento(p, { tipo: 'remito' })
    await sql('update public.documentos set deleted_at = now() where id = $1', [anulado])
    const factura = await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await sql('update public.documentos set factura_id = $1 where id = $2', [factura, remito1])

    const vista = await presupuestoEnVista(p)
    expect(vista).toMatchObject({ ordenes_compra: 1, remitos: 2, facturas: 1, ordenes_pago: 0, remitos_sin_factura: 1 })
    expect(Number(vista.facturado)).toBe(1000)
    expect(Number(vista.saldo)).toBe(1000)
  })

  it('el saldo baja con cada orden de pago y una OP anulada no cuenta', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const factura = await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA', fecha_vencimiento: '2020-01-01' })
    expect(await facturaEnVista(factura)).toEqual({ saldo: 1000, estado_cobro: 'vencida' })

    const op1 = await documento(p, { tipo: 'orden_pago', monto: 400 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 400)', [op1, factura])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 600, estado_cobro: 'parcial' })

    const op2 = await documento(p, { tipo: 'orden_pago', monto: 600 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 600)', [op2, factura])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 0, estado_cobro: 'cobrada' })

    await sql('update public.documentos set deleted_at = now() where id = $1', [op2])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 600, estado_cobro: 'parcial' })
    expect(Number((await presupuestoEnVista(p)).saldo)).toBe(600)
  })

  it('una nota de crédito no suma al facturado ni tiene saldo', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await documento(p, { tipo: 'factura', monto: 200, tipo_comprobante: 'NC' })
    const vista = await presupuestoEnVista(p)
    expect(vista.facturas).toBe(2)
    expect(Number(vista.facturado)).toBe(1000)
    expect(Number(vista.saldo)).toBe(1000)
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
