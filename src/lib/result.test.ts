import { PostgrestError, StorageApiError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { ErrorQuote } from '@/lib/quotes/service'
import { UNEXPECTED_MESSAGE, messageForUser, type Result } from './result'

describe('mensajeParaUsuario', () => {
  let consola: MockInstance<typeof console.error>

  beforeEach(() => {
    consola = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consola.mockRestore()
  })

  it('un ErrorCotizacion llega con su mensaje y no se registra', () => {
    expect(messageForUser(new ErrorQuote('Hay ítems sin precio'))).toBe('Hay ítems sin precio')
    expect(consola).not.toHaveBeenCalled()
  })

  it('una regla de negocio de la base (P0001) llega con su texto y no se registra', () => {
    const error = { code: 'P0001', message: 'La cotización cambió desde que la abriste; volvé a intentarlo' }
    expect(messageForUser(error)).toBe('La cotización cambió desde que la abriste; volvé a intentarlo')
    expect(consola).not.toHaveBeenCalled()
  })

  it('los demás errores de la base se traducen con mensajeErrorBase y se registran', () => {
    const permiso = { code: '42501', message: 'Tu usuario no está habilitado', details: null, hint: null }
    expect(messageForUser(permiso)).toBe('No tenés permiso para hacer esta operación')
    expect(messageForUser({ code: '23514', message: 'check' })).toBe('Algún dato no es válido')
    expect(messageForUser({ code: '22003', message: 'overflow' })).toBe('Algún número es demasiado grande')
    // Lo que mensajeErrorBase no traduce dice "No se pudo guardar…": acá hay acciones que no guardan (rechazar,
    // duplicar, buscar clientes), así que va el genérico.
    expect(messageForUser({ code: '23503', message: 'fk' })).toBe(UNEXPECTED_MESSAGE)
    expect(messageForUser({ code: 'PGRST116', message: 'varias filas' })).toBe(UNEXPECTED_MESSAGE)
    expect(consola).toHaveBeenCalledTimes(5)
    expect(consola).toHaveBeenCalledWith(permiso)
  })

  it('un PostgrestError (la clase) también es un error de la base', () => {
    const error = new PostgrestError({ message: 'Hay ítems sin precio', details: '', hint: '', code: 'P0001' })
    expect(messageForUser(error)).toBe('Hay ítems sin precio')
  })

  it('un error de Storage da el mensaje genérico aunque traiga código', () => {
    const error = new StorageApiError('The resource already exists', 409, '409', 'storage', 'ResourceAlreadyExists')
    expect(messageForUser(error)).toBe(UNEXPECTED_MESSAGE)
    expect(consola).toHaveBeenCalledWith(error)
  })

  it('una falla de red de PostgREST (sin código) da el mensaje genérico', () => {
    const error = new PostgrestError({ message: 'FetchError: fetch failed', details: '', hint: '', code: '' })
    expect(messageForUser(error)).toBe(UNEXPECTED_MESSAGE)
  })

  it('cualquier otra cosa da el mensaje genérico y se registra', () => {
    const errorNode = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    for (const error of [new Error('boom'), errorNode, z.string().safeParse(1).error, 'texto', undefined, null]) {
      expect(messageForUser(error)).toBe(UNEXPECTED_MESSAGE)
    }
    expect(consola).toHaveBeenCalledTimes(6)
  })
})

describe('Resultado', () => {
  it('distingue el éxito (con datos) del fallo (con mensaje y errores opcionales)', () => {
    const success: Result<{ id: string }> = { ok: true, datos: { id: 'x' } }
    const fallo: Result<{ id: string }> = {
      ok: false,
      message: 'Revisá los datos marcados',
      errors: { cliente: 'Elegí el cliente' },
    }
    const withoutData: Result = { ok: true, datos: null, message: 'Cotización rechazada' }
    expect([success.ok, fallo.ok, withoutData.ok]).toEqual([true, false, true])
  })
})
