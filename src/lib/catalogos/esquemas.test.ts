import { describe, expect, it } from 'vitest'
import { esquemaEmpresa, esquemaEquipo, esquemaFirmante, esquemaNombrePlantilla } from './esquemas'

describe('esquemaEmpresa', () => {
  const base = {
    razon_social: 'Equipos Patagónicos',
    cuit: '',
    direccion: 'T. Planas 5168',
    ciudad: 'Neuquén',
    provincia: 'Neuquén',
    telefono: '0299 - 6019931',
    email: 'equipos@equipospatagonicos.com.ar',
    web: 'www.equipospatagonicos.com.ar',
    indice_base: 'junio 2026',
    proxima_actualizacion: 'noviembre de 2026',
  }

  it('acepta los datos reales con CUIT vacío', () => {
    expect(esquemaEmpresa.parse(base).cuit).toBeNull()
  })

  it('exige razón social y valida CUIT y email', () => {
    const resultado = esquemaEmpresa.safeParse({ ...base, razon_social: ' ', cuit: '1', email: 'x' })
    expect(resultado.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['razon_social', 'cuit', 'email']))
  })
})

describe('esquemaFirmante', () => {
  it('exige nombre', () => {
    expect(esquemaFirmante.safeParse({ nombre: '', cargo: '', telefono: '', email: '' }).success).toBe(false)
  })
})

describe('esquemaEquipo', () => {
  const base = { nombre: 'Grúa 70 TN', capacidad_tn: '', marca: '', modelo: '', identificacion: '', descripcion: '' }

  it('interpreta la capacidad al estilo argentino y la deja opcional', () => {
    expect(esquemaEquipo.parse({ ...base, capacidad_tn: '60,5' }).capacidad_tn).toBe(60.5)
    expect(esquemaEquipo.parse(base).capacidad_tn).toBeNull()
  })

  it('rechaza capacidades no positivas o ilegibles', () => {
    for (const capacidad_tn of ['0', '-3', 'mucho']) {
      const resultado = esquemaEquipo.safeParse({ ...base, capacidad_tn })
      expect(resultado.error?.issues[0]?.message).toBe('Ingresá una capacidad en toneladas mayor a 0')
    }
  })
})

describe('esquemaNombrePlantilla', () => {
  it('exige un nombre de hasta 100 caracteres', () => {
    expect(esquemaNombrePlantilla.safeParse({ nombre: '' }).success).toBe(false)
    expect(esquemaNombrePlantilla.safeParse({ nombre: 'x'.repeat(101) }).success).toBe(false)
    expect(esquemaNombrePlantilla.parse({ nombre: ' Mensual ' }).nombre).toBe('Mensual')
  })
})
