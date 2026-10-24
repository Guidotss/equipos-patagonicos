// tests/integration/documentos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function insertar(campos: Record<string, unknown>) {
  const columnas = Object.keys(campos)
  const [fila] = await sql<{ id: string; numero_normalizado: string }>(
    `insert into public.documentos (${columnas.join(', ')}, notas)
     values (${columnas.map((_, i) => `$${i + 1}`).join(', ')}, $${columnas.length + 1})
     returning id, numero_normalizado`,
    [...Object.values(campos), MARCA],
  )
  return fila
}

describe('documentos', () => {
  it('la app solo lee: insert directo rechazado', async () => {
    const { error } = await activo.client.from('documentos').insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo los ve; uno inactivo no', async () => {
    const { id } = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect((await activo.client.from('documentos').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await inactivo.client.from('documentos').select('id').eq('id', id)).data).toEqual([])
  })

  it('normaliza el número para buscar', async () => {
    const { numero_normalizado } = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito', numero: '0001-00012345' })
    expect(numero_normalizado).toBe('100012345')
  })

  it('factura y orden de pago exigen monto; la factura, tipo de comprobante', async () => {
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'orden_pago' })).rejects.toThrow(/documentos_monto_requerido/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100 })).rejects.toThrow(/documentos_comprobante_requerido/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })).resolves.toBeTruthy()
  })

  it('los campos de factura y de remito no se mezclan', async () => {
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'remito', tipo_comprobante: 'FA' })).rejects.toThrow(/documentos_campos_de_factura/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'orden_compra', periodo_desde: '2026-10-01' })).rejects.toThrow(/documentos_campos_de_remito/)
    await expect(
      insertar({ cliente_id: ids.cliente_id, tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }),
    ).rejects.toThrow(/documentos_periodo/)
  })

  it('un documento solo se vincula a presupuestos aprobados del mismo cliente', async () => {
    const presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const otroCliente = await nuevoPresupuesto(activo.client, ids.cliente_con_contacto_id, MARCA)
    const { id } = await insertar({ cliente_id: ids.cliente_id, tipo: 'orden_compra' })

    await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, presupuesto])
    await expect(
      sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, otroCliente]),
    ).rejects.toThrow(/mismo cliente/)
  })

  it('un remito solo apunta a una factura de su cliente; una OP solo cancela facturas', async () => {
    const factura = await insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const facturaOtro = await insertar({ cliente_id: ids.cliente_con_contacto_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const remito = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito' })
    const op = await insertar({ cliente_id: ids.cliente_id, tipo: 'orden_pago', monto: 100 })

    await sql('update public.documentos set factura_id = $1 where id = $2', [factura.id, remito.id])
    await expect(sql('update public.documentos set factura_id = $1 where id = $2', [facturaOtro.id, remito.id])).rejects.toThrow(/mismo cliente/)

    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, factura.id])
    await expect(
      sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, remito.id]),
    ).rejects.toThrow(/solo cancela facturas/)
  })
})
