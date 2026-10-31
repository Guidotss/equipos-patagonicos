import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSessionInvalid, messageErrorLogin } from './errors'

describe('esSesionInvalida', () => {
  it('trata como sin sesión los errores 4xx de Auth y la sesión faltante', () => {
    expect(isSessionInvalid(new AuthSessionMissingError())).toBe(true)
    expect(isSessionInvalid(new AuthInvalidJwtError('jwt inválido'))).toBe(true)
    expect(isSessionInvalid(new AuthApiError('refresh revocado', 400, 'refresh_token_not_found'))).toBe(true)
  })

  it('no confunde Auth caído o limitado con falta de sesión', () => {
    expect(isSessionInvalid(new AuthApiError('demasiados', 429, 'over_request_rate_limit'))).toBe(false)
    expect(isSessionInvalid(new AuthApiError('error interno', 500, 'unexpected_failure'))).toBe(false)
    expect(isSessionInvalid(new AuthRetryableFetchError('fetch failed', 0))).toBe(false)
  })
})

describe('mensajeErrorLogin', () => {
  it('credenciales incorrectas', () => {
    expect(messageErrorLogin(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Email o contraseña incorrectos',
    )
  })

  it('demasiados intentos', () => {
    expect(messageErrorLogin(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.',
    )
  })

  it('Auth caído, sin red o con una respuesta inesperada', () => {
    const expected = 'No pudimos conectar con el servidor. Probá de nuevo en un momento.'
    expect(messageErrorLogin(new AuthRetryableFetchError('fetch failed', 0))).toBe(expected)
    expect(messageErrorLogin(new AuthApiError('boom', 503, 'unexpected_failure'))).toBe(expected)
    // Respuesta que no es JSON (p. ej. un 404 en HTML por una URL mal configurada).
    expect(messageErrorLogin(new AuthUnknownError('Unexpected token <', new Error()))).toBe(expected)
    // API key inválida: 401 sin código de error.
    expect(messageErrorLogin(new AuthApiError('Invalid API key', 401, undefined))).toBe(expected)
  })
})
