import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIELDS_DOCUMENT, schemaDocument } from '@/lib/documents/schemas'
import { prepareUpload, registerDocument } from '@/lib/documents/service'
import { idsOfExample } from './quotes-helpers'
import { limpiarFilesSubidos, limpiarDocuments, newBudget, uploadFile } from './documents-helpers'
import { adminClient, removeUser, crearUser, sql } from './helpers'

const MARCA = `pantallas-${crypto.randomUUID()}`
let user: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let clientId: string
let budget: string
const subidos: string[] = []
const datos = (changes: Record<string, string>) =>
  schemaDocument.parse({
    ...Object.fromEntries(FIELDS_DOCUMENT.map((field) => [field, ''])),
    notas: MARCA,
    ...changes,
  })

beforeAll(async () => {
  user = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  clientId = (await idsOfExample()).cliente_id
  budget = await newBudget(user.client, clientId, MARCA)
})
afterAll(async () => {
  await limpiarDocuments(MARCA)
  await limpiarFilesSubidos()
  if (subidos.length) await adminClient().storage.from('documentos').remove(subidos)
  await removeUser(user.id)
  await removeUser(inactivo.id)
})

async function register(
  tipo: string,
  fields: Record<string, string> = {},
  relaciones: { remitos?: string[]; aplicaciones?: { factura_id: string; monto_aplicado: number }[] } = {},
) {
  const archivo = await uploadFile(user.client, clientId)
  return registerDocument(user.client, {
    clientId,
    budgets: [budget],
    datos: datos({ tipo, ...fields }),
    archivos: [archivo],
    ...relaciones,
  })
}

describe('circuito documental de las pantallas', () => {
  it('sube directamente con firma, conserva fecha vacía y completa el circuito hasta saldo cero; anula y restaura un pago', async () => {
    const signature = await prepareUpload(user.client, { clientId, mime: 'application/pdf', tamano: 24 })
    subidos.push(signature.path)
    const upload = await fetch(signature.signedUrl, {
      method: 'PUT',
      body: '%PDF-1.4 documento prueba',
      headers: { 'content-type': 'application/pdf' },
    })
    expect(upload.status).toBe(200)
    const oc = await registerDocument(user.client, {
      clientId,
      budgets: [budget],
      datos: datos({ tipo: 'orden_compra' }),
      archivos: [{ path: signature.path, nombre_original: 'OC.pdf' }],
    })
    expect((await user.client.from('documentos').select('fecha, numero').eq('id', oc).single()).data).toEqual({
      fecha: null,
      numero: '',
    })
    const deliveryNote = await register('remito')
    const invoice = await register('factura', { monto: '1.000,00', tipo_comprobante: 'FA' }, { remitos: [deliveryNote] })
    const pago = await register(
      'orden_pago',
      { monto: '1.000,00' },
      { aplicaciones: [{ factura_id: invoice, monto_aplicado: 1000 }] },
    )
    const saldo = async () =>
      (await user.client.from('v_facturas').select('saldo, estado_cobro').eq('id', invoice).single()).data
    expect(await saldo()).toEqual({ saldo: 0, estado_cobro: 'cobrada' })
    expect((await user.client.rpc('anular_documento', { p_id: pago })).error).toBeNull()
    expect(await saldo()).toEqual({ saldo: 1000, estado_cobro: 'pendiente' })
    await user.client.rpc('anular_documento', { p_id: invoice })
    expect((await user.client.rpc('restaurar_documento', { p_id: pago })).error?.message).toContain(
      'restaurala primero',
    )
    await user.client.rpc('restaurar_documento', { p_id: invoice })
    expect((await user.client.rpc('restaurar_documento', { p_id: pago })).error).toBeNull()
    expect(await saldo()).toEqual({ saldo: 0, estado_cobro: 'cobrada' })
    const { data: resumen } = await user.client
      .from('v_presupuestos')
      .select('ordenes_compra, remitos, facturas, ordenes_pago, saldo')
      .eq('id', budget)
      .single()
    expect(resumen).toEqual({ ordenes_compra: 1, remitos: 1, facturas: 1, ordenes_pago: 1, saldo: 0 })
  })

  it('edita campos y archivos en una transacción y rechaza quitar archivos ajenos o dejar el documento vacío', async () => {
    const id = await register('remito', { numero: 'Anterior', fecha: '2026-10-20' })
    const { data: archivo } = await user.client
      .from('documento_archivos')
      .select('id')
      .eq('documento_id', id)
      .single()
    const base = {
      p_id: id,
      p_datos: datos({ tipo: 'remito', numero: 'Nuevo' }),
      p_presupuestos: [budget],
      p_remitos: [],
      p_aplicaciones: [],
    }
    expect(
      (await user.client.rpc('actualizar_documento_con_archivos', { ...base, p_quitar: [archivo!.id] })).error
        ?.message,
    ).toContain('al menos un archivo')
    expect((await user.client.from('documentos').select('numero, fecha').eq('id', id).single()).data).toEqual({
      numero: 'Anterior',
      fecha: '2026-10-20',
    })
    const nuevo = await uploadFile(user.client, clientId, 'Corrección.pdf')
    expect(
      (
        await user.client.rpc('actualizar_documento_con_archivos', {
          ...base,
          p_archivos: [nuevo],
          p_quitar: [archivo!.id],
        })
      ).error,
    ).toBeNull()
    expect((await user.client.from('documentos').select('numero, fecha').eq('id', id).single()).data).toEqual({
      numero: 'Nuevo',
      fecha: null,
    })
    expect(
      (await user.client.rpc('actualizar_documento_con_archivos', { ...base, p_quitar: [crypto.randomUUID()] }))
        .error?.message,
    ).toContain('no pertenece')
    expect((await inactivo.client.rpc('actualizar_documento_con_archivos', base)).error).not.toBeNull()
  })

  it('normaliza MIME de Storage y da errores claros en nombre y motivo demasiado largos', async () => {
    const archivo = await uploadFile(user.client, clientId)
    await sql(
      "update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '\"APPLICATION/PDF; charset=utf-8\"') where bucket_id = 'documentos' and name = $1",
      [archivo.path],
    )
    const id = await registerDocument(user.client, {
      clientId,
      budgets: [budget],
      datos: datos({ tipo: 'orden_compra' }),
      archivos: [archivo],
    })
    expect(
      (await user.client.from('documento_archivos').select('mime').eq('documento_id', id).single()).data?.mime,
    ).toBe('application/pdf')
    const largo = await uploadFile(user.client, clientId)
    expect(
      (
        await user.client.rpc('agregar_archivos', {
          p_documento_id: id,
          p_archivos: [{ ...largo, nombre_original: 'a'.repeat(256) }],
        })
      ).error?.message,
    ).toContain('255')
    expect(
      (
        await user.client.rpc('cambiar_estado_presupuesto', {
          p_id: budget,
          p_estado: 'anulado',
          p_motivo: 'a'.repeat(2001),
        })
      ).error?.message,
    ).toContain('2000')
    const { data: encontrados, error } = await user.client.rpc('buscar_presupuestos', {
      texto: MARCA,
      cliente: clientId,
    })
    expect(error).toBeNull()
    expect(encontrados?.some((item) => item.id === budget)).toBe(true)
  })
})
