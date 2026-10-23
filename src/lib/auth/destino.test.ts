import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './destino'

describe('destinoSeguro', () => {
  it('acepta rutas internas', () => {
    expect(destinoSeguro('/clientes')).toBe('/clientes')
    expect(destinoSeguro('/cotizaciones?estado=enviada')).toBe('/cotizaciones?estado=enviada')
  })

  it.each([undefined, '', 'https://malicioso.com', '//malicioso.com', '/\\malicioso.com', 'clientes'])(
    'manda a / ante %j',
    (destino) => {
      expect(destinoSeguro(destino)).toBe('/')
    },
  )
})
