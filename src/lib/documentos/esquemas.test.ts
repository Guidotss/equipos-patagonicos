import { describe, expect, it } from 'vitest'
import { CAMPOS_DOCUMENTO, esquemaDocumento } from './esquemas'

function formulario(datos: Partial<Record<(typeof CAMPOS_DOCUMENTO)[number], string>>) {
  const vacio = Object.fromEntries(CAMPOS_DOCUMENTO.map((c) => [c, ''])) as Record<(typeof CAMPOS_DOCUMENTO)[number], string>
  return { ...vacio, ...datos }
}

describe('esquemaDocumento', () => {
  it('un remito mínimo: sin número ni fecha (quedan para completar)', () => {
    expect(esquemaDocumento.parse(formulario({ tipo: 'remito' }))).toEqual({
      tipo: 'remito',
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
    })
  })

  it('factura: exige monto y tipo de comprobante, y entiende montos argentinos', () => {
    const sinDatos = esquemaDocumento.safeParse(formulario({ tipo: 'factura' }))
    expect(sinDatos.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['monto', 'tipo_comprobante']))

    const factura = esquemaDocumento.parse(
      formulario({ tipo: 'factura', monto: '1.950.000,50', tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' }),
    )
    expect(factura).toMatchObject({ monto: 1_950_000.5, tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' })
  })

  it('orden de pago exige monto', () => {
    expect(esquemaDocumento.safeParse(formulario({ tipo: 'orden_pago' })).error?.issues[0]?.message).toBe('Ingresá el monto')
  })

  it('limpia los campos que no corresponden al tipo (para que la base no los rechace)', () => {
    const oc = esquemaDocumento.parse(
      formulario({ tipo: 'orden_compra', tipo_comprobante: 'FA', periodo_desde: '2026-10-01', numero_oc_ref: 'x' }),
    )
    expect(oc).toMatchObject({ tipo_comprobante: null, periodo_desde: null, numero_oc_ref: '' })
  })

  it('valida fechas y que el período no termine antes de empezar', () => {
    expect(esquemaDocumento.safeParse(formulario({ tipo: 'remito', fecha: '31/10/2026' })).success).toBe(false)
    const periodo = esquemaDocumento.safeParse(formulario({ tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }))
    expect(periodo.error?.issues[0]).toMatchObject({ path: ['periodo_hasta'], message: 'El período termina antes de empezar' })
  })
})
