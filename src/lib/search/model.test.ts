import { describe, expect, it } from 'vitest'
import { schemaSearch, isGroupSearch, hrefSearch } from './model'

describe('búsqueda global', () => {
  it('admite 200 caracteres y preserva los caracteres literales del usuario', () => {
    expect(schemaSearch.parse(' a_%\\ ')).toBe('a_%\\')
    expect(schemaSearch.safeParse('a'.repeat(200)).success).toBe(true)
    expect(schemaSearch.safeParse('a'.repeat(201)).success).toBe(false)
  })
  it('valida el grupo y codifica los enlaces sin alterar la consulta', () => {
    expect(isGroupSearch('remito')).toBe(true)
    expect(isGroupSearch('constructor')).toBe(false)
    const enlace = hrefSearch('OC & 1/2', 'orden_compra', 2)
    expect(new URL(enlace, 'http://localhost').searchParams.get('q')).toBe('OC & 1/2')
    expect(enlace).toContain('pagina=2')
  })
})
