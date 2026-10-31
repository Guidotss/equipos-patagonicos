import { describe, expect, it } from 'vitest'
import { CAMPOS_DOCUMENTO, esquemaDocumento } from './esquemas'

function formulario(datos: Partial<Record<(typeof CAMPOS_DOCUMENTO)[number], string>>) {
  const vacio = Object.fromEntries(CAMPOS_DOCUMENTO.map((c) => [c, ''])) as Record<(typeof CAMPOS_DOCUMENTO)[number], string>
  return { ...vacio, ...datos }
}

function problemas(datos: Partial<Record<(typeof CAMPOS_DOCUMENTO)[number], string>>) {
  return esquemaDocumento.safeParse(formulario(datos)).error?.issues.map(({ path, message }) => ({ path, message }))
}

describe('esquemaDocumento', () => {
  it('CAMPOS_DOCUMENTO tiene exactamente los campos del esquema', () => {
    expect([...CAMPOS_DOCUMENTO].sort()).toEqual(Object.keys(esquemaDocumento.in.shape).sort())
  })

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
    expect(problemas({ tipo: 'factura' })).toEqual([
      { path: ['monto'], message: 'Ingresá el monto' },
      { path: ['tipo_comprobante'], message: 'Elegí el tipo de comprobante' },
    ])

    const factura = esquemaDocumento.parse(
      formulario({ tipo: 'factura', monto: '1.950.000,50', tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' }),
    )
    expect(factura).toMatchObject({ monto: 1_950_000.5, tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' })
  })

  it('factura con un comprobante que no existe: mensaje en castellano', () => {
    expect(problemas({ tipo: 'factura', monto: '100', tipo_comprobante: 'XX' })).toEqual([
      { path: ['tipo_comprobante'], message: 'Elegí un comprobante válido' },
    ])
  })

  it('el comprobante se ignora si el documento no es una factura', () => {
    expect(esquemaDocumento.parse(formulario({ tipo: 'remito', tipo_comprobante: 'XX' })).tipo_comprobante).toBeNull()
  })

  it('orden de pago exige monto', () => {
    expect(esquemaDocumento.safeParse(formulario({ tipo: 'orden_pago' })).error?.issues[0]?.message).toBe('Ingresá el monto')
  })

  it('rechaza montos que no son números, cero o de más de 12 dígitos enteros', () => {
    for (const monto of ['abc', '0', '1000000000000']) {
      expect(problemas({ tipo: 'orden_pago', monto })).toEqual([{ path: ['monto'], message: 'Monto inválido' }])
    }
  })

  it('acepta hasta el máximo que guarda la base (numeric(14, 2)) y nada más', () => {
    expect(esquemaDocumento.parse(formulario({ tipo: 'orden_pago', monto: '999.999.999.999,99' })).monto).toBe(999_999_999_999.99)
    expect(problemas({ tipo: 'orden_pago', monto: '1.000.000.000.000' })).toEqual([{ path: ['monto'], message: 'Monto inválido' }])
  })

  it('el comprobante tiene hasta 10 caracteres, como en los otros campos de texto', () => {
    expect(problemas({ tipo: 'factura', monto: '100', tipo_comprobante: 'X'.repeat(11) })).toContainEqual({
      path: ['tipo_comprobante'],
      message: 'Máximo 10 caracteres',
    })
  })

  it('rechaza un equipo que no es un UUID', () => {
    expect(problemas({ tipo: 'remito', equipo_id: 'grua-40' })).toEqual([{ path: ['equipo_id'], message: 'Equipo inválido' }])
  })

  it('exige el tipo de documento', () => {
    expect(problemas({})).toEqual([{ path: ['tipo'], message: 'Elegí el tipo de documento' }])
  })

  it('limpia los campos que no corresponden al tipo (para que la base no los rechace)', () => {
    const oc = esquemaDocumento.parse(
      formulario({
        tipo: 'orden_compra',
        tipo_comprobante: 'FA',
        fecha_vencimiento: '2026-11-30',
        numero_oc_ref: 'x',
        periodo_desde: '2026-10-01',
        periodo_hasta: '2026-10-31',
        equipo_id: crypto.randomUUID(),
      }),
    )
    expect(oc).toMatchObject({
      tipo_comprobante: null,
      fecha_vencimiento: null,
      numero_oc_ref: '',
      periodo_desde: null,
      periodo_hasta: null,
      equipo_id: null,
    })
  })

  it('una factura con período y equipo cargados los pierde', () => {
    const factura = esquemaDocumento.parse(
      formulario({
        tipo: 'factura',
        monto: '100',
        tipo_comprobante: 'FA',
        periodo_desde: '2026-10-01',
        periodo_hasta: '2026-10-31',
        equipo_id: crypto.randomUUID(),
      }),
    )
    expect(factura).toMatchObject({ tipo_comprobante: 'FA', periodo_desde: null, periodo_hasta: null, equipo_id: null })
  })

  it('valida fechas y que el período no termine antes de empezar', () => {
    expect(problemas({ tipo: 'remito', fecha: '31/10/2026' })).toEqual([{ path: ['fecha'], message: 'Fecha inválida' }])
    const periodo = esquemaDocumento.safeParse(formulario({ tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }))
    expect(periodo.error?.issues[0]).toMatchObject({ path: ['periodo_hasta'], message: 'El período termina antes de empezar' })
  })
})
