/** "COTIZACION N° 112711 VERTICE.pdf", como nombran hoy los archivos. */
export function nameFileQuote(numero: number, razonSocial: string): string {
  const primera = razonSocial.trim().split(/\s+/)[0] ?? ''
  const limpia = primera
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  return `COTIZACION N° ${numero}${limpia ? ` ${limpia}` : ''}.pdf`
}

/** Encabezado Content-Disposition con nombre ASCII de respaldo y el nombre real en UTF-8 (RFC 6266). */
export function contentDisposition(nombre: string, tipo: 'inline' | 'attachment' = 'inline'): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '')
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`
}
