import { describe, expect, it } from 'vitest'
import { schemaCompany, schemaEquipment, schemaSigner, schemaNameTemplate } from './schemas'

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
    expect(schemaCompany.parse(base).cuit).toBeNull()
  })

  it.each(['1', '30-71952967-1', 'identificación pendiente'])('acepta el CUIT informado %s', (cuit) => {
    expect(schemaCompany.safeParse({ ...base, cuit }).success).toBe(true)
  })

  it('exige razón social y valida email', () => {
    const result = schemaCompany.safeParse({ ...base, razon_social: ' ', cuit: '1', email: 'x' })
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['razon_social', 'email'])
  })
})

describe('esquemaFirmante', () => {
  it('exige nombre', () => {
    expect(schemaSigner.safeParse({ nombre: '', cargo: '', telefono: '', email: '' }).success).toBe(false)
  })
})

describe('esquemaEquipo', () => {
  const base = { nombre: 'Grúa 70 TN', capacidad_tn: '', marca: '', modelo: '', identificacion: '', descripcion: '' }

  it('interpreta la capacidad al estilo argentino y la deja opcional', () => {
    expect(schemaEquipment.parse({ ...base, capacidad_tn: '60,5' }).capacidad_tn).toBe(60.5)
    expect(schemaEquipment.parse(base).capacidad_tn).toBeNull()
  })

  it('rechaza capacidades no positivas o ilegibles', () => {
    for (const capacidad_tn of ['0', '-3', 'mucho']) {
      const result = schemaEquipment.safeParse({ ...base, capacidad_tn })
      expect(result.error?.issues[0]?.message).toBe('Ingresá una capacidad en toneladas mayor a 0')
    }
  })

  it('rechaza capacidades que no entran en la base (numeric(6,1))', () => {
    const result = schemaEquipment.safeParse({ ...base, capacidad_tn: '100.000' })
    expect(result.error?.issues[0]?.message).toBe('La capacidad tiene que ser menor a 100.000 TN')
  })
})

describe('esquemaNombrePlantilla', () => {
  it('exige un nombre de hasta 100 caracteres', () => {
    expect(schemaNameTemplate.safeParse({ nombre: '' }).success).toBe(false)
    expect(schemaNameTemplate.safeParse({ nombre: 'x'.repeat(101) }).success).toBe(false)
    expect(schemaNameTemplate.parse({ nombre: ' Mensual ' }).nombre).toBe('Mensual')
  })
})
