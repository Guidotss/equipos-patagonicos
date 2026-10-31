const ORIGIN_INTERNO = 'http://interno.invalid'

/**
 * Solo permite volver a rutas internas después del login (evita open redirects).
 *
 * Se valida con el mismo parser de URL que usan los navegadores (borra TAB/LF/CR, trata `\`
 * como `/` y resuelve `.` y `..`) y se devuelve la ruta ya normalizada. Una ruta que queda
 * empezando con `//` se rechaza: al volver a parsearla (lo hace Next en el cliente) se lee
 * como otro host.
 */
export function destinationSeguro(destination: string | undefined | null): string {
  if (!destination?.startsWith('/')) return '/'

  let url: URL
  try {
    url = new URL(destination, ORIGIN_INTERNO)
  } catch {
    return '/'
  }

  if (url.origin !== ORIGIN_INTERNO || url.pathname.startsWith('//')) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
