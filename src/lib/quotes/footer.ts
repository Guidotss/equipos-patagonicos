type DatosPie = { direccion: string; ciudad: string; telefono: string; email: string }

/** Tramos del pie con dato: los de la empresa y lo fijo ("Argentina", el "Tel. " del teléfono). */
export type TramoPie = { prefijo: string; valor: string; fijo: boolean }

export function tramosPie(empresa: DatosPie): TramoPie[] {
  const tramos: TramoPie[] = [
    { prefijo: '', valor: empresa.direccion, fijo: false },
    { prefijo: '', valor: empresa.ciudad, fijo: false },
    { prefijo: '', valor: 'Argentina', fijo: true },
    { prefijo: 'Tel. ', valor: empresa.telefono, fijo: false },
    { prefijo: '', valor: empresa.email, fijo: false },
  ]
  return tramos.filter((tramo) => tramo.valor)
}

/** Línea del pie de cada página del PDF: "T. Planas 5168 - Neuquén - Argentina - Tel. 0299 … - email". */
export function lineaPie(empresa: DatosPie): string {
  return tramosPie(empresa)
    .map((tramo) => tramo.prefijo + tramo.valor)
    .join(' - ')
}
