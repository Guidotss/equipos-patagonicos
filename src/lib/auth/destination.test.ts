import { describe, expect, it } from 'vitest'
import { destinationSeguro } from './destination'

describe('destinoSeguro', () => {
  it('acepta rutas internas', () => {
    expect(destinationSeguro('/clientes')).toBe('/clientes')
    expect(destinationSeguro('/cotizaciones?estado=enviada')).toBe('/cotizaciones?estado=enviada')
  })

  it.each([
    undefined,
    '',
    'https://malicioso.com',
    '//malicioso.com',
    '/\\malicioso.com',
    'clientes',
    // El parser de URL del navegador borra TAB, LF y CR: quedan como `//malicioso.com`.
    '/\t/malicioso.com',
    '/\n/malicioso.com',
    '/\r\n/malicioso.com',
    '/\t\\malicioso.com',
    // Los segmentos de punto dejan la ruta en `//malicioso.com`, que Next reinterpreta como host.
    '/.//malicioso.com',
    '/a/..//malicioso.com',
    '/%2e%2e//malicioso.com',
  ])('manda a / ante %j', (destination) => {
    expect(destinationSeguro(destination)).toBe('/')
  })
})
