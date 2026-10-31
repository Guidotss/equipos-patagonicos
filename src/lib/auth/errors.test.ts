import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { esSesionInvalida, mensajeErrorLogin } from './errores'

describe('esSesionInvalida', () => {
  it('trata como sin sesión los errores 4xx de Auth y la sesión faltante', () => {
    expect(esSesionInvalida(new AuthSessionMissingError())).toBe(true)
    expect(esSesionInvalida(new AuthInvalidJwtError('jwt inválido'))).toBe(true)
    expect(esSesionInvalida(new AuthApiError('refresh revocado', 400, 'refresh_token_not_found'))).toBe(true)
  })

  it('no confunde Auth caído o limitado con falta de sesión', () => {
    expect(esSesionInvalida(new AuthApiError('demasiados', 429, 'over_request_rate_limit'))).toBe(false)
    expect(esSesionInvalida(new AuthApiError('error interno', 500, 'unexpected_failure'))).toBe(false)
    expect(esSesionInvalida(new AuthRetryableFetchError('fetch failed', 0))).toBe(false)
  })
})

describe('mensajeErrorLogin', () => {
  it('credenciales incorrectas', () => {
    expect(mensajeErrorLogin(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Email o contraseña incorrectos',
    )
  })

  it('demasiados intentos', () => {
    expect(mensajeErrorLogin(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.',
    )
  })

  it('Auth caído, sin red o con una respuesta inesperada', () => {
    const esperado = 'No pudimos conectar con el servidor. Probá de nuevo en un momento.'
    expect(mensajeErrorLogin(new AuthRetryableFetchError('fetch failed', 0))).toBe(esperado)
    expect(mensajeErrorLogin(new AuthApiError('boom', 503, 'unexpected_failure'))).toBe(esperado)
    // Respuesta que no es JSON (p. ej. un 404 en HTML por una URL mal configurada).
    expect(mensajeErrorLogin(new AuthUnknownError('Unexpected token <', new Error()))).toBe(esperado)
    // API key inválida: 401 sin código de error.
    expect(mensajeErrorLogin(new AuthApiError('Invalid API key', 401, undefined))).toBe(esperado)
  })
})
