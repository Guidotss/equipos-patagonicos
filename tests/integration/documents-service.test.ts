// tests/integration/documentos-servicio.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DataDocument } from '@/lib/documents/schemas'
import { ErrorDocument, prepareUpload, registerDocument, urlDownload } from '@/lib/documents/service'
import { idsOfExample } from './quotes-helpers'
import { limpiarDocuments, newBudget } from './documents-helpers'
import { adminClient, removeUser, crearUser } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
let budget: string
/** El archivo que sube el navegador con la URL firmada: se borra al final aunque el test falle antes de registrarlo. */
let pathSubido: string | undefined

const DATA_VACIOS: DataDocument = {
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
function clientEspia() {
  const buckets: string[] = []
  const cliente = {
    storage: {
      from(bucket: string) {
        buckets.push(bucket)
        throw new Error('no tenía que pedir la URL')
      },
    },
  }
  return { cliente: cliente as unknown as Parameters<typeof prepareUpload>[0], buckets }
}

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
  budget = await newBudget(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  try {
    await limpiarDocuments(MARCA)
    if (pathSubido) {
      const { error } = await adminClient().storage.from('documentos').remove([pathSubido])
      if (error) throw new Error('No se pudo borrar el archivo subido: ' + error.message)
    }
  } finally {
    await removeUser(activo.id)
  }
})

describe('servicio de documentos', () => {
  it('prepara la subida, el navegador sube con la URL firmada y se registra el documento', async () => {
    const content = new Blob(['%PDF-1.4 remito firmado'], { type: 'application/pdf' })
    const { path, token } = await prepareUpload(activo.client, {
      clientId: ids.cliente_id,
      mime: 'application/pdf',
      tamano: content.size,
    })
    pathSubido = path
    expect(path).toMatch(new RegExp(`^documentos/${ids.cliente_id}/[0-9a-f-]{36}\\.pdf$`))

    const upload = await activo.client.storage.from('documentos').uploadToSignedUrl(path, token, content, {
      contentType: 'application/pdf',
    })
    expect(upload.error).toBeNull()

    const id = await registerDocument(activo.client, {
      clientId: ids.cliente_id,
      budgets: [budget],
      datos: {
        ...DATA_VACIOS,
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

    const url = await urlDownload(activo.client, path, 'Parte diario Neuquén N° 456.pdf')
    const response = await fetch(url)
    expect(response.status).toBe(200)
    const layout = response.headers.get('content-disposition')
    expect(layout).toContain('attachment')
    expect(layout).toContain("filename*=UTF-8''Parte%20diario%20Neuqu%C3%A9n%20N%C2%B0%20456.pdf")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(await content.arrayBuffer()))
  })

  it('rechaza tipos y tamaños no permitidos antes de pedir la URL', async () => {
    const { cliente, buckets } = clientEspia()
    await expect(prepareUpload(cliente, { clientId: ids.cliente_id, mime: 'image/heic', tamano: 100 })).rejects.toThrow(
      ErrorDocument,
    )
    await expect(
      prepareUpload(cliente, { clientId: ids.cliente_id, mime: 'application/pdf', tamano: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/10 MB/)
    expect(buckets).toEqual([])
  })

  it('rechaza un cliente que no es un UUID antes que nada', async () => {
    const { cliente, buckets } = clientEspia()
    for (const archivo of [
      { clientId: '../otro-cliente', mime: 'application/pdf', tamano: 100 },
      { clientId: 'x', mime: 'image/heic', tamano: 0 },
    ]) {
      const intento = prepareUpload(cliente, archivo)
      await expect(intento).rejects.toThrow(ErrorDocument)
      await expect(intento).rejects.toThrow('Cliente inválido')
    }
    expect(buckets).toEqual([])
  })

  it('los errores de negocio de la base llegan como ErrorDocumento', async () => {
    await expect(
      registerDocument(activo.client, {
        clientId: ids.cliente_id,
        budgets: [],
        datos: { ...DATA_VACIOS, notas: MARCA },
        archivos: [],
      }),
    ).rejects.toThrow(ErrorDocument)
  })
})
