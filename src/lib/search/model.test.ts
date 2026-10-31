import { describe, expect, it } from 'vitest'
import { esquemaBusqueda, esGrupoBusqueda, hrefBusqueda } from './modelo'

describe('búsqueda global', () => {
  it('admite 200 caracteres y preserva los caracteres literales del usuario', () => {
    expect(esquemaBusqueda.parse(' a_%\\ ')).toBe('a_%\\')
    expect(esquemaBusqueda.safeParse('a'.repeat(200)).success).toBe(true)
    expect(esquemaBusqueda.safeParse('a'.repeat(201)).success).toBe(false)
  })
  it('valida el grupo y codifica los enlaces sin alterar la consulta', () => {
    expect(esGrupoBusqueda('remito')).toBe(true)
    expect(esGrupoBusqueda('constructor')).toBe(false)
    const enlace = hrefBusqueda('OC & 1/2', 'orden_compra', 2)
    expect(new URL(enlace, 'http://localhost').searchParams.get('q')).toBe('OC & 1/2')
    expect(enlace).toContain('pagina=2')
  })
})
