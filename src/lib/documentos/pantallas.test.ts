import { describe, expect, it } from 'vitest'
import { CAMPOS_DOCUMENTO } from './esquemas'
import { esquemaGuardarDocumento } from './pantallas'

const clienteId = crypto.randomUUID()
const presupuesto = crypto.randomUUID()
const entrada = () => ({
  clienteId,
  presupuestos: [presupuesto],
  datos: { ...Object.fromEntries(CAMPOS_DOCUMENTO.map((campo) => [campo, ''])), tipo: 'remito' },
  archivos: [{ path: `documentos/${clienteId}/${crypto.randomUUID()}.pdf`, nombre_original: 'Remito.pdf' }],
})

describe('entrada de documentos desde el navegador', () => {
  it('rechaza UUIDs, rutas de otro cliente, nombres largos y binarios sin procesar', () => {
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), clienteId: '../otro' }).success).toBe(false)
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), presupuestos: ['x'] }).success).toBe(false)
    expect(
      esquemaGuardarDocumento.safeParse({
        ...entrada(),
        archivos: [
          { path: `documentos/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`, nombre_original: 'Remito.pdf' },
        ],
      }).success,
    ).toBe(false)
    expect(
      esquemaGuardarDocumento.safeParse({
        ...entrada(),
        archivos: [{ ...entrada().archivos[0], nombre_original: 'a'.repeat(256) }],
      }).success,
    ).toBe(false)
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), archivos: [new Blob(['pdf'])] }).success).toBe(false)
  })
  it('acepta fecha y número vacíos, pero exige archivo al crear y monto al facturar', () => {
    expect(esquemaGuardarDocumento.parse(entrada()).datos).toMatchObject({ fecha: null, numero: '' })
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), archivos: [] }).success).toBe(false)
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), id: crypto.randomUUID(), archivos: [] }).success).toBe(
      true,
    )
    expect(
      esquemaGuardarDocumento.safeParse({
        ...entrada(),
        datos: { ...entrada().datos, tipo: 'factura', tipo_comprobante: 'FA' },
      }).success,
    ).toBe(false)
  })
  it('rechaza año cero y aplicaciones sin monto o con más decimales de los que admite la base', () => {
    expect(
      esquemaGuardarDocumento.safeParse({ ...entrada(), datos: { ...entrada().datos, fecha: '0000-01-01' } }).success,
    ).toBe(false)
    for (const monto_aplicado of ['', '0', '1,001', 'abc'])
      expect(
        esquemaGuardarDocumento.safeParse({
          ...entrada(),
          aplicaciones: [{ factura_id: crypto.randomUUID(), monto_aplicado }],
        }).success,
      ).toBe(false)
  })
  it('solo admite aprobación con una OC del presupuesto correspondiente', () => {
    const cotizacion = { id: presupuesto, version: '2026-10-28T12:00:00.000Z' }
    expect(esquemaGuardarDocumento.safeParse({ ...entrada(), cotizacion }).success).toBe(false)
    expect(
      esquemaGuardarDocumento.safeParse({
        ...entrada(),
        cotizacion,
        datos: { ...entrada().datos, tipo: 'orden_compra' },
      }).success,
    ).toBe(true)
  })
})
