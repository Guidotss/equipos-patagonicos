import { describe, expect, it } from 'vitest'
import { FIELDS_DOCUMENT } from './schemas'
import { schemaSaveDocument } from './screens'

const clientId = crypto.randomUUID()
const budget = crypto.randomUUID()
const entrada = () => ({
  clientId,
  budgets: [budget],
  datos: { ...Object.fromEntries(FIELDS_DOCUMENT.map((field) => [field, ''])), tipo: 'remito' },
  archivos: [{ path: `documentos/${clientId}/${crypto.randomUUID()}.pdf`, nombre_original: 'Remito.pdf' }],
})

describe('entrada de documentos desde el navegador', () => {
  it('rechaza UUIDs, rutas de otro cliente, nombres largos y binarios sin procesar', () => {
    expect(schemaSaveDocument.safeParse({ ...entrada(), clientId: '../otro' }).success).toBe(false)
    expect(schemaSaveDocument.safeParse({ ...entrada(), budgets: ['x'] }).success).toBe(false)
    expect(
      schemaSaveDocument.safeParse({
        ...entrada(),
        archivos: [
          { path: `documentos/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`, nombre_original: 'Remito.pdf' },
        ],
      }).success,
    ).toBe(false)
    expect(
      schemaSaveDocument.safeParse({
        ...entrada(),
        archivos: [{ ...entrada().archivos[0], nombre_original: 'a'.repeat(256) }],
      }).success,
    ).toBe(false)
    expect(schemaSaveDocument.safeParse({ ...entrada(), archivos: [new Blob(['pdf'])] }).success).toBe(false)
  })
  it('acepta fecha y número vacíos, pero exige archivo al crear y monto al facturar', () => {
    expect(schemaSaveDocument.parse(entrada()).datos).toMatchObject({ fecha: null, numero: '' })
    expect(schemaSaveDocument.safeParse({ ...entrada(), archivos: [] }).success).toBe(false)
    expect(schemaSaveDocument.safeParse({ ...entrada(), id: crypto.randomUUID(), archivos: [] }).success).toBe(
      true,
    )
    expect(
      schemaSaveDocument.safeParse({
        ...entrada(),
        datos: { ...entrada().datos, tipo: 'factura', tipo_comprobante: 'FA' },
      }).success,
    ).toBe(false)
  })
  it('rechaza año cero y aplicaciones sin monto o con más decimales de los que admite la base', () => {
    expect(
      schemaSaveDocument.safeParse({ ...entrada(), datos: { ...entrada().datos, fecha: '0000-01-01' } }).success,
    ).toBe(false)
    for (const monto_aplicado of ['', '0', '1,001', 'abc'])
      expect(
        schemaSaveDocument.safeParse({
          ...entrada(),
          aplicaciones: [{ factura_id: crypto.randomUUID(), monto_aplicado }],
        }).success,
      ).toBe(false)
  })
  it('solo admite aprobación con una OC del presupuesto correspondiente', () => {
    const quote = { id: budget, version: '2026-10-28T12:00:00.000Z' }
    expect(schemaSaveDocument.safeParse({ ...entrada(), cotizacion: quote }).success).toBe(false)
    expect(
      schemaSaveDocument.safeParse({
        ...entrada(),
        cotizacion: quote,
        datos: { ...entrada().datos, tipo: 'orden_compra' },
      }).success,
    ).toBe(true)
  })
})
