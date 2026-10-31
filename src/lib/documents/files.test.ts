import { describe, expect, it } from 'vitest'
import { SIZE_MAXIMO, withNameOfDownload, pathFile, validateFile } from './files'

describe('validarArchivo', () => {
  it('acepta PDF, JPG y PNG de hasta 10 MB', () => {
    expect(validateFile({ mime: 'application/pdf', tamano: 1000 })).toBeNull()
    expect(validateFile({ mime: 'image/jpeg', tamano: SIZE_MAXIMO })).toBeNull()
  })

  it('rechaza otros tipos, vacíos y demasiado grandes', () => {
    expect(validateFile({ mime: 'image/heic', tamano: 1000 })).toBe('Solo se aceptan PDF, JPG o PNG')
    expect(validateFile({ mime: 'application/pdf', tamano: 0 })).toBe('El archivo está vacío')
    expect(validateFile({ mime: 'application/pdf', tamano: Number.NaN })).toBe('El archivo está vacío')
    expect(validateFile({ mime: 'application/pdf', tamano: SIZE_MAXIMO + 1 })).toBe('El archivo supera los 10 MB')
  })
})

describe('rutaArchivo', () => {
  const CLIENTE = '5b0e3c1a-2f4d-4c8e-9a7b-1d2e3f4a5b6c'

  it('arma una ruta ASCII con la extensión según el tipo', () => {
    expect(pathFile(CLIENTE, 'image/png', 'abc')).toBe(`documentos/${CLIENTE}/abc.png`)
    expect(pathFile(CLIENTE, 'application/pdf')).toMatch(new RegExp(`^documentos/${CLIENTE}/[0-9a-f-]{36}\\.pdf$`))
  })

  it('rechaza un cliente que no es un UUID (no se puede salir de su carpeta)', () => {
    expect(() => pathFile('cliente-1', 'image/png', 'abc')).toThrow('clienteId inválido')
    expect(() => pathFile('../otro', 'application/pdf')).toThrow('clienteId inválido')
  })
})

describe('conNombreDeDescarga', () => {
  it('agrega el nombre original codificado una sola vez', () => {
    const url = withNameOfDownload(
      'http://127.0.0.1:54321/storage/v1/object/sign/documentos/x.pdf?token=abc',
      'Remito Neuquén N° 1.pdf',
    )
    expect(url).toContain('token=abc')
    expect(new URL(url).searchParams.get('download')).toBe('Remito Neuquén N° 1.pdf')
    expect(url).not.toContain('%25')
  })
})
