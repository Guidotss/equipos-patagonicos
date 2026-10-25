// tests/integration/documentos-servicio.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DatosDocumento } from '@/lib/documentos/esquemas'
import { ErrorDocumento, prepararSubida, registrarDocumento, urlDescarga } from '@/lib/documentos/servicio'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let presupuesto: string

const DATOS_VACIOS: DatosDocumento = {
  tipo: 'orden_compra',
  numero: '',
  fecha: null,
  monto: null,
  tipo_comprobante: null,
  fecha_vencimiento: null,
  numero_oc_ref: '',
  periodo_desde: null,
  periodo_hasta: null,
  equipo_id: null,
  notas: '',
}

/** Cliente falso que anota cada `storage.from`: sirve para probar que se rechaza antes de pedir la URL. */
function clienteEspia() {
  const buckets: string[] = []
  const cliente = {
    storage: {
      from(bucket: string) {
        buckets.push(bucket)
        throw new Error('no tenía que pedir la URL')
      },
    },
  }
  return { cliente: cliente as unknown as Parameters<typeof prepararSubida>[0], buckets }
}

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
  presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

describe('servicio de documentos', () => {
  it('prepara la subida, el navegador sube con la URL firmada y se registra el documento', async () => {
    const contenido = new Blob(['%PDF-1.4 remito firmado'], { type: 'application/pdf' })
    const { path, token } = await prepararSubida(activo.client, {
      clienteId: ids.cliente_id,
      mime: 'application/pdf',
      tamano: contenido.size,
    })
    expect(path).toMatch(new RegExp(`^documentos/${ids.cliente_id}/[0-9a-f-]{36}\\.pdf$`))

    const subida = await activo.client.storage.from('documentos').uploadToSignedUrl(path, token, contenido, {
      contentType: 'application/pdf',
    })
    expect(subida.error).toBeNull()

    const id = await registrarDocumento(activo.client, {
      clienteId: ids.cliente_id,
      presupuestos: [presupuesto],
      datos: {
        ...DATOS_VACIOS,
        tipo: 'remito',
        numero: 'R-0001-00000456',
        fecha: '2026-10-24',
        periodo_desde: '2026-10-01',
        periodo_hasta: '2026-10-24',
        equipo_id: ids.equipo_id,
        notas: MARCA,
      },
      archivos: [{ path, nombre_original: 'Parte diario Neuquén N° 456.pdf' }],
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const url = await urlDescarga(activo.client, path, 'Parte diario Neuquén N° 456.pdf')
    const respuesta = await fetch(url)
    expect(respuesta.status).toBe(200)
    const disposicion = respuesta.headers.get('content-disposition')
    expect(disposicion).toContain('attachment')
    expect(disposicion).toContain("filename*=UTF-8''Parte%20diario%20Neuqu%C3%A9n%20N%C2%B0%20456.pdf")
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(new Uint8Array(await contenido.arrayBuffer()))
  })

  it('rechaza tipos y tamaños no permitidos antes de pedir la URL', async () => {
    const { cliente, buckets } = clienteEspia()
    await expect(prepararSubida(cliente, { clienteId: ids.cliente_id, mime: 'image/heic', tamano: 100 })).rejects.toThrow(
      ErrorDocumento,
    )
    await expect(
      prepararSubida(cliente, { clienteId: ids.cliente_id, mime: 'application/pdf', tamano: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/10 MB/)
    expect(buckets).toEqual([])
  })

  it('rechaza un cliente que no es un UUID antes que nada', async () => {
    const { cliente, buckets } = clienteEspia()
    for (const archivo of [
      { clienteId: '../otro-cliente', mime: 'application/pdf', tamano: 100 },
      { clienteId: 'x', mime: 'image/heic', tamano: 0 },
    ]) {
      const intento = prepararSubida(cliente, archivo)
      await expect(intento).rejects.toThrow(ErrorDocumento)
      await expect(intento).rejects.toThrow('Cliente inválido')
    }
    expect(buckets).toEqual([])
  })

  it('los errores de negocio de la base llegan como ErrorDocumento', async () => {
    await expect(
      registrarDocumento(activo.client, {
        clienteId: ids.cliente_id,
        presupuestos: [],
        datos: { ...DATOS_VACIOS, notas: MARCA },
        archivos: [],
      }),
    ).rejects.toThrow(ErrorDocumento)
  })
})
