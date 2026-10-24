import { type AuthError, isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'

/**
 * getClaims da error tanto si la sesión no sirve (token adulterado, o vencido con el refresh
 * revocado: 4xx de Auth) como si Auth no respondió (red caída, 5xx, 429). Lo primero equivale
 * a no tener sesión; lo segundo no dice nada de la sesión.
 */
export function esSesionInvalida(error: AuthError): boolean {
  return (
    isAuthSessionMissingError(error) ||
    error.name === 'AuthInvalidJwtError' ||
    (isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429)
  )
}

/** Mensaje para el formulario de login según el error de signInWithPassword. */
export function mensajeErrorLogin(error: AuthError): string {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.'
  }
  // Solo un 400 de Auth habla de las credenciales. Todo lo demás (red caída, 5xx, una respuesta
  // que no es JSON, una URL o una key mal configuradas) es un problema del servidor.
  if (isAuthApiError(error) && (error.code === 'invalid_credentials' || error.status === 400)) {
    return 'Email o contraseña incorrectos'
  }
  return 'No pudimos conectar con el servidor. Probá de nuevo en un momento.'
}
