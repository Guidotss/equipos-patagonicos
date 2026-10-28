import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAMPOS_DOCUMENTO, esquemaDocumento } from '@/lib/documentos/esquemas'
import { prepararSubida, registrarDocumento } from '@/lib/documentos/servicio'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarArchivosSubidos, limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `pantallas-${crypto.randomUUID()}`
let usuario: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let clienteId: string
let presupuesto: string
const subidos: string[] = []
const datos = (cambios: Record<string, string>) =>
  esquemaDocumento.parse({
    ...Object.fromEntries(CAMPOS_DOCUMENTO.map((campo) => [campo, ''])),
    notas: MARCA,
    ...cambios,
  })

beforeAll(async () => {
  usuario = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  clienteId = (await idsDeEjemplo()).cliente_id
  presupuesto = await nuevoPresupuesto(usuario.client, clienteId, MARCA)
})
afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await limpiarArchivosSubidos()
  if (subidos.length) await adminClient().storage.from('documentos').remove(subidos)
  await borrarUsuario(usuario.id)
  await borrarUsuario(inactivo.id)
})

async function registrar(
  tipo: string,
  campos: Record<string, string> = {},
  relaciones: { remitos?: string[]; aplicaciones?: { factura_id: string; monto_aplicado: number }[] } = {},
) {
  const archivo = await subirArchivo(usuario.client, clienteId)
  return registrarDocumento(usuario.client, {
    clienteId,
    presupuestos: [presupuesto],
    datos: datos({ tipo, ...campos }),
    archivos: [archivo],
    ...relaciones,
  })
}

describe('circuito documental de las pantallas', () => {
  it('sube directamente con firma, conserva fecha vacía y completa el circuito hasta saldo cero; anula y restaura un pago', async () => {
    const firma = await prepararSubida(usuario.client, { clienteId, mime: 'application/pdf', tamano: 24 })
    subidos.push(firma.path)
    const subida = await fetch(firma.signedUrl, {
      method: 'PUT',
      body: '%PDF-1.4 documento prueba',
      headers: { 'content-type': 'application/pdf' },
    })
    expect(subida.status).toBe(200)
    const oc = await registrarDocumento(usuario.client, {
      clienteId,
      presupuestos: [presupuesto],
      datos: datos({ tipo: 'orden_compra' }),
      archivos: [{ path: firma.path, nombre_original: 'OC.pdf' }],
    })
    expect((await usuario.client.from('documentos').select('fecha, numero').eq('id', oc).single()).data).toEqual({
      fecha: null,
      numero: '',
    })
    const remito = await registrar('remito')
    const factura = await registrar('factura', { monto: '1.000,00', tipo_comprobante: 'FA' }, { remitos: [remito] })
    const pago = await registrar(
      'orden_pago',
      { monto: '1.000,00' },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )
    const saldo = async () =>
      (await usuario.client.from('v_facturas').select('saldo, estado_cobro').eq('id', factura).single()).data
    expect(await saldo()).toEqual({ saldo: 0, estado_cobro: 'cobrada' })
    expect((await usuario.client.rpc('anular_documento', { p_id: pago })).error).toBeNull()
    expect(await saldo()).toEqual({ saldo: 1000, estado_cobro: 'pendiente' })
    await usuario.client.rpc('anular_documento', { p_id: factura })
    expect((await usuario.client.rpc('restaurar_documento', { p_id: pago })).error?.message).toContain(
      'restaurala primero',
    )
    await usuario.client.rpc('restaurar_documento', { p_id: factura })
    expect((await usuario.client.rpc('restaurar_documento', { p_id: pago })).error).toBeNull()
    expect(await saldo()).toEqual({ saldo: 0, estado_cobro: 'cobrada' })
    const { data: resumen } = await usuario.client
      .from('v_presupuestos')
      .select('ordenes_compra, remitos, facturas, ordenes_pago, saldo')
      .eq('id', presupuesto)
      .single()
    expect(resumen).toEqual({ ordenes_compra: 1, remitos: 1, facturas: 1, ordenes_pago: 1, saldo: 0 })
  })

  it('edita campos y archivos en una transacción y rechaza quitar archivos ajenos o dejar el documento vacío', async () => {
    const id = await registrar('remito', { numero: 'Anterior', fecha: '2026-10-20' })
    const { data: archivo } = await usuario.client
      .from('documento_archivos')
      .select('id')
      .eq('documento_id', id)
      .single()
    const base = {
      p_id: id,
      p_datos: datos({ tipo: 'remito', numero: 'Nuevo' }),
      p_presupuestos: [presupuesto],
      p_remitos: [],
      p_aplicaciones: [],
    }
    expect(
      (await usuario.client.rpc('actualizar_documento_con_archivos', { ...base, p_quitar: [archivo!.id] })).error
        ?.message,
    ).toContain('al menos un archivo')
    expect((await usuario.client.from('documentos').select('numero, fecha').eq('id', id).single()).data).toEqual({
      numero: 'Anterior',
      fecha: '2026-10-20',
    })
    const nuevo = await subirArchivo(usuario.client, clienteId, 'Corrección.pdf')
    expect(
      (
        await usuario.client.rpc('actualizar_documento_con_archivos', {
          ...base,
          p_archivos: [nuevo],
          p_quitar: [archivo!.id],
        })
      ).error,
    ).toBeNull()
    expect((await usuario.client.from('documentos').select('numero, fecha').eq('id', id).single()).data).toEqual({
      numero: 'Nuevo',
      fecha: null,
    })
    expect(
      (await usuario.client.rpc('actualizar_documento_con_archivos', { ...base, p_quitar: [crypto.randomUUID()] }))
        .error?.message,
    ).toContain('no pertenece')
    expect((await inactivo.client.rpc('actualizar_documento_con_archivos', base)).error).not.toBeNull()
  })

  it('normaliza MIME de Storage y da errores claros en nombre y motivo demasiado largos', async () => {
    const archivo = await subirArchivo(usuario.client, clienteId)
    await sql(
      "update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '\"APPLICATION/PDF; charset=utf-8\"') where bucket_id = 'documentos' and name = $1",
      [archivo.path],
    )
    const id = await registrarDocumento(usuario.client, {
      clienteId,
      presupuestos: [presupuesto],
      datos: datos({ tipo: 'orden_compra' }),
      archivos: [archivo],
    })
    expect(
      (await usuario.client.from('documento_archivos').select('mime').eq('documento_id', id).single()).data?.mime,
    ).toBe('application/pdf')
    const largo = await subirArchivo(usuario.client, clienteId)
    expect(
      (
        await usuario.client.rpc('agregar_archivos', {
          p_documento_id: id,
          p_archivos: [{ ...largo, nombre_original: 'a'.repeat(256) }],
        })
      ).error?.message,
    ).toContain('255')
    expect(
      (
        await usuario.client.rpc('cambiar_estado_presupuesto', {
          p_id: presupuesto,
          p_estado: 'anulado',
          p_motivo: 'a'.repeat(2001),
        })
      ).error?.message,
    ).toContain('2000')
    const { data: encontrados, error } = await usuario.client.rpc('buscar_presupuestos', {
      texto: MARCA,
      cliente: clienteId,
    })
    expect(error).toBeNull()
    expect(encontrados?.some((item) => item.id === presupuesto)).toBe(true)
  })
})
