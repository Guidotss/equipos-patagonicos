import { PostgrestError, StorageApiError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { ErrorCotizacion } from '@/lib/cotizaciones/servicio'
import { MENSAJE_INESPERADO, mensajeParaUsuario, type Resultado } from './resultado'

describe('mensajeParaUsuario', () => {
  let consola: MockInstance<typeof console.error>

  beforeEach(() => {
    consola = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consola.mockRestore()
  })

  it('un ErrorCotizacion llega con su mensaje y no se registra', () => {
    expect(mensajeParaUsuario(new ErrorCotizacion('Hay ítems sin precio'))).toBe('Hay ítems sin precio')
    expect(consola).not.toHaveBeenCalled()
  })

  it('una regla de negocio de la base (P0001) llega con su texto y no se registra', () => {
    const error = { code: 'P0001', message: 'La cotización cambió desde que la abriste; volvé a intentarlo' }
    expect(mensajeParaUsuario(error)).toBe('La cotización cambió desde que la abriste; volvé a intentarlo')
    expect(consola).not.toHaveBeenCalled()
  })

  it('los demás errores de la base se traducen con mensajeErrorBase y se registran', () => {
    const permiso = { code: '42501', message: 'Tu usuario no está habilitado', details: null, hint: null }
    expect(mensajeParaUsuario(permiso)).toBe('No tenés permiso para hacer esta operación')
    expect(mensajeParaUsuario({ code: '23514', message: 'check' })).toBe('Algún dato no es válido')
    expect(mensajeParaUsuario({ code: '22003', message: 'overflow' })).toBe('Algún número es demasiado grande')
    // Lo que mensajeErrorBase no traduce dice "No se pudo guardar…": acá hay acciones que no guardan (rechazar,
    // duplicar, buscar clientes), así que va el genérico.
    expect(mensajeParaUsuario({ code: '23503', message: 'fk' })).toBe(MENSAJE_INESPERADO)
    expect(mensajeParaUsuario({ code: 'PGRST116', message: 'varias filas' })).toBe(MENSAJE_INESPERADO)
    expect(consola).toHaveBeenCalledTimes(5)
    expect(consola).toHaveBeenCalledWith(permiso)
  })

  it('un PostgrestError (la clase) también es un error de la base', () => {
    const error = new PostgrestError({ message: 'Hay ítems sin precio', details: '', hint: '', code: 'P0001' })
    expect(mensajeParaUsuario(error)).toBe('Hay ítems sin precio')
  })

  it('un error de Storage da el mensaje genérico aunque traiga código', () => {
    const error = new StorageApiError('The resource already exists', 409, '409', 'storage', 'ResourceAlreadyExists')
    expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
    expect(consola).toHaveBeenCalledWith(error)
  })

  it('una falla de red de PostgREST (sin código) da el mensaje genérico', () => {
    const error = new PostgrestError({ message: 'FetchError: fetch failed', details: '', hint: '', code: '' })
    expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
  })

  it('cualquier otra cosa da el mensaje genérico y se registra', () => {
    const errorNode = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    for (const error of [new Error('boom'), errorNode, z.string().safeParse(1).error, 'texto', undefined, null]) {
      expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
    }
    expect(consola).toHaveBeenCalledTimes(6)
  })
})

describe('Resultado', () => {
  it('distingue el éxito (con datos) del fallo (con mensaje y errores opcionales)', () => {
    const exito: Resultado<{ id: string }> = { ok: true, datos: { id: 'x' } }
    const fallo: Resultado<{ id: string }> = {
      ok: false,
      mensaje: 'Revisá los datos marcados',
      errores: { cliente: 'Elegí el cliente' },
    }
    const sinDatos: Resultado = { ok: true, datos: null, mensaje: 'Cotización rechazada' }
    expect([exito.ok, fallo.ok, sinDatos.ok]).toEqual([true, false, true])
  })
})
