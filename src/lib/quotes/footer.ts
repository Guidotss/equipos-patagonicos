type DataFooter = { direccion: string; ciudad: string; telefono: string; email: string }

/** Tramos del pie con dato: los de la empresa y lo fijo ("Argentina", el "Tel. " del teléfono). */
export type TramoFooter = { prefix: string; value: string; fijo: boolean }

export function tramosFooter(company: DataFooter): TramoFooter[] {
  const tramos: TramoFooter[] = [
    { prefix: '', value: company.direccion, fijo: false },
    { prefix: '', value: company.ciudad, fijo: false },
    { prefix: '', value: 'Argentina', fijo: true },
    { prefix: 'Tel. ', value: company.telefono, fijo: false },
    { prefix: '', value: company.email, fijo: false },
  ]
  return tramos.filter((tramo) => tramo.value)
}

/** Línea del pie de cada página del PDF: "T. Planas 5168 - Neuquén - Argentina - Tel. 0299 … - email". */
export function lineFooter(company: DataFooter): string {
  return tramosFooter(company)
    .map((tramo) => tramo.prefix + tramo.value)
    .join(' - ')
}
