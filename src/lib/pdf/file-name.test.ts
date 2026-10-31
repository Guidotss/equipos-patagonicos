import { describe, expect, it } from 'vitest'
import { contentDisposition, nameFileQuote } from './file-name'

describe('nombreArchivoCotizacion', () => {
  it('usa el patrón de los archivos actuales con la primera palabra del cliente', () => {
    expect(nameFileQuote(112711, 'VERTICE SERVICIOS INTEGRALES S.R.L.')).toBe('COTIZACION N° 112711 VERTICE.pdf')
    expect(nameFileQuote(112523, 'Milicic S.A.')).toBe('COTIZACION N° 112523 MILICIC.pdf')
  })

  it('saca acentos y símbolos', () => {
    expect(nameFileQuote(1, 'Ñandú & Cía.')).toBe('COTIZACION N° 1 NANDU.pdf')
    expect(nameFileQuote(1, '')).toBe('COTIZACION N° 1.pdf')
  })
})

describe('contentDisposition', () => {
  it('incluye un nombre ASCII y el nombre UTF-8 codificado', () => {
    expect(contentDisposition('COTIZACION N° 112711 VERTICE.pdf')).toBe(
      `inline; filename="COTIZACION N 112711 VERTICE.pdf"; filename*=UTF-8''COTIZACION%20N%C2%B0%20112711%20VERTICE.pdf`,
    )
    expect(contentDisposition('a.pdf', 'attachment')).toMatch(/^attachment; /)
  })
})
