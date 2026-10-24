import { describe, expect, it } from 'vitest'
import { TAMANO_MAXIMO, conNombreDeDescarga, rutaArchivo, validarArchivo } from './archivos'

describe('validarArchivo', () => {
  it('acepta PDF, JPG y PNG de hasta 10 MB', () => {
    expect(validarArchivo({ mime: 'application/pdf', tamano: 1000 })).toBeNull()
    expect(validarArchivo({ mime: 'image/jpeg', tamano: TAMANO_MAXIMO })).toBeNull()
  })

  it('rechaza otros tipos, vacíos y demasiado grandes', () => {
    expect(validarArchivo({ mime: 'image/heic', tamano: 1000 })).toBe('Solo se aceptan PDF, JPG o PNG')
    expect(validarArchivo({ mime: 'application/pdf', tamano: 0 })).toBe('El archivo está vacío')
    expect(validarArchivo({ mime: 'application/pdf', tamano: TAMANO_MAXIMO + 1 })).toBe('El archivo supera los 10 MB')
  })
})

describe('rutaArchivo', () => {
  it('arma una ruta ASCII con la extensión según el tipo', () => {
    expect(rutaArchivo('cliente-1', 'image/png', 'abc')).toBe('documentos/cliente-1/abc.png')
    expect(rutaArchivo('cliente-1', 'application/pdf')).toMatch(/^documentos\/cliente-1\/[0-9a-f-]{36}\.pdf$/)
  })
})

describe('conNombreDeDescarga', () => {
  it('agrega el nombre original codificado una sola vez', () => {
    const url = conNombreDeDescarga(
      'http://127.0.0.1:54321/storage/v1/object/sign/documentos/x.pdf?token=abc',
      'Remito Neuquén N° 1.pdf',
    )
    expect(url).toContain('token=abc')
    expect(new URL(url).searchParams.get('download')).toBe('Remito Neuquén N° 1.pdf')
    expect(url).not.toContain('%25')
  })
})
