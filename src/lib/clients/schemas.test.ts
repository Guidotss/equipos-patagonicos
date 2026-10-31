import { describe, expect, it } from 'vitest'
import { FIELDS_CLIENT, schemaClient, schemaContact } from './schemas'

function cliente(datos: Partial<Record<(typeof FIELDS_CLIENT)[number], string>>) {
  const empty = Object.fromEntries(FIELDS_CLIENT.map((c) => [c, ''])) as Record<(typeof FIELDS_CLIENT)[number], string>
  return { ...empty, ...datos }
}

describe('esquemaCliente', () => {
  it('acepta un prospecto solo con razón social y normaliza los opcionales', () => {
    const result = schemaClient.parse(cliente({ razon_social: '  Milicic S.A.  ' }))
    expect(result).toMatchObject({ razon_social: 'Milicic S.A.', cuit: null, condicion_iva: null, email: '' })
  })

  it('guarda el CUIT solo con dígitos', () => {
    expect(schemaClient.parse(cliente({ razon_social: 'Vértice', cuit: '30-71952967-0' })).cuit).toBe('30719529670')
  })

  it.each([
    ['30-71952967-1', '30719529671'],
    ['abc', 'abc'],
    ['30-71952967', '3071952967'],
    ['11-71952967-6', '11719529676'],
    ['307195296701', '307195296701'],
  ])('acepta el CUIT informado %s sin validación fiscal', (cuit, expected) => {
    expect(schemaClient.parse(cliente({ razon_social: 'X', cuit })).cuit).toBe(expected)
  })

  it('exige razón social y valida email y condición de IVA', () => {
    const result = schemaClient.safeParse(cliente({ email: 'no-es-email', condicion_iva: 'otra' }))
    const fields = result.error?.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['razon_social', 'email', 'condicion_iva']))
    const iva = result.error?.issues.find((i) => i.path[0] === 'condicion_iva')
    expect(iva?.message).toBe('Elegí una condición de IVA válida')
  })
})

describe('esquemaContacto', () => {
  it('exige nombre y valida el email', () => {
    expect(schemaContact.safeParse({ nombre: '', cargo: '', email: '', telefono: '' }).success).toBe(false)
    expect(schemaContact.safeParse({ nombre: 'Yanina', cargo: '', email: 'mal', telefono: '' }).success).toBe(false)
    expect(schemaContact.parse({ nombre: ' Yanina ', cargo: '', email: '', telefono: '' }).nombre).toBe('Yanina')
  })
})
