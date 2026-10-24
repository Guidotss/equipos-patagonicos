/** Línea del pie de cada página del PDF: "T. Planas 5168 - Neuquén - Argentina - Tel. 0299 … - email". */
export function lineaPie(empresa: { direccion: string; ciudad: string; telefono: string; email: string }): string {
  return [empresa.direccion, empresa.ciudad, 'Argentina', empresa.telefono && `Tel. ${empresa.telefono}`, empresa.email]
    .filter(Boolean)
    .join(' - ')
}
