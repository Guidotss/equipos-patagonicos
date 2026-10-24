import { describe, expect, it } from 'vitest'
import { CAMPOS_CLIENTE, esquemaCliente, esquemaContacto } from './esquemas'

function cliente(datos: Partial<Record<(typeof CAMPOS_CLIENTE)[number], string>>) {
  const vacio = Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c, ''])) as Record<(typeof CAMPOS_CLIENTE)[number], string>
  return { ...vacio, ...datos }
}

describe('esquemaCliente', () => {
  it('acepta un prospecto solo con razón social y normaliza los opcionales', () => {
    const resultado = esquemaCliente.parse(cliente({ razon_social: '  Milicic S.A.  ' }))
    expect(resultado).toMatchObject({ razon_social: 'Milicic S.A.', cuit: null, condicion_iva: null, email: '' })
  })

  it('guarda el CUIT solo con dígitos', () => {
    expect(esquemaCliente.parse(cliente({ razon_social: 'Vértice', cuit: '30-71952967-0' })).cuit).toBe('30719529670')
  })

  it.each([
    ['30-71952967-1', 'dígito verificador'],
    ['abc', 'letras'],
    ['30-71952967', 'incompleto'],
  ])('rechaza el CUIT %s (%s)', (cuit) => {
    const resultado = esquemaCliente.safeParse(cliente({ razon_social: 'X', cuit }))
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe('El CUIT no es válido')
  })

  it('exige razón social y valida email y condición de IVA', () => {
    const resultado = esquemaCliente.safeParse(cliente({ email: 'no-es-email', condicion_iva: 'otra' }))
    const campos = resultado.error?.issues.map((i) => i.path[0])
    expect(campos).toEqual(expect.arrayContaining(['razon_social', 'email', 'condicion_iva']))
    const iva = resultado.error?.issues.find((i) => i.path[0] === 'condicion_iva')
    expect(iva?.message).toBe('Elegí una condición de IVA válida')
  })
})

describe('esquemaContacto', () => {
  it('exige nombre y valida el email', () => {
    expect(esquemaContacto.safeParse({ nombre: '', cargo: '', email: '', telefono: '' }).success).toBe(false)
    expect(esquemaContacto.safeParse({ nombre: 'Yanina', cargo: '', email: 'mal', telefono: '' }).success).toBe(false)
    expect(esquemaContacto.parse({ nombre: ' Yanina ', cargo: '', email: '', telefono: '' }).nombre).toBe('Yanina')
  })
})
