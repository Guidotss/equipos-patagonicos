/** Solo permite volver a rutas internas después del login (evita open redirects). */
export function destinoSeguro(destino: string | undefined | null): string {
  if (!destino || !destino.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\')) return '/'
  return destino
}
