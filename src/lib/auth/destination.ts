const ORIGEN_INTERNO = 'http://interno.invalid'

/**
 * Solo permite volver a rutas internas después del login (evita open redirects).
 *
 * Se valida con el mismo parser de URL que usan los navegadores (borra TAB/LF/CR, trata `\`
 * como `/` y resuelve `.` y `..`) y se devuelve la ruta ya normalizada. Una ruta que queda
 * empezando con `//` se rechaza: al volver a parsearla (lo hace Next en el cliente) se lee
 * como otro host.
 */
export function destinoSeguro(destino: string | undefined | null): string {
  if (!destino?.startsWith('/')) return '/'

  let url: URL
  try {
    url = new URL(destino, ORIGEN_INTERNO)
  } catch {
    return '/'
  }

  if (url.origin !== ORIGEN_INTERNO || url.pathname.startsWith('//')) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
