import { formatCuit } from '@/lib/cuit'
import { headerDate } from '@/lib/format/dates'
import type { Format, Unit } from '@/lib/templates/content'
import { parsearFormat, type NodoFormat } from '@/lib/templates/format'
import { resolverVariables, variablesDesconocidas, type NameVariable } from '@/lib/templates/variables'
import { readData } from './data'
import { lineFooter } from './footer'

/** Filas de la base que hacen falta para dibujar una cotización. */
export type SourceDocument = {
  cotizacion: {
    /** null: todavía no se guardó (vista previa del editor). {{numero}} queda sin completar. */
    numero: number | null
    fecha: string
    formato: Format
    asunto: string
    intro: string
    validez_dias: number
    mostrar_total: boolean
    datos: unknown
    /** Los ocultos no se dibujan ni cuentan para las variables sin completar. */
    bloques: { titulo: string; contenido: string; hidden?: boolean }[]
  }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: Unit
  }[]
  cliente: { razon_social: string; cuit: string | null }
  contacto: { nombre: string; email: string } | null
  equipo: { capacidad_tn: number | null; descripcion: string } | null
  firmante: { nombre: string; cargo: string; telefono: string } | null
  empresa: {
    razon_social: string
    direccion: string
    ciudad: string
    telefono: string
    email: string
    web: string
    indice_base: string
    proxima_actualizacion: string
  }
}

export type DocumentQuote = {
  numero: number | null
  formato: Format
  encabezadoFecha: string
  destinatario: { razonSocial: string; cuit: string | null; atencion: string | null; email: string | null }
  asunto: string
  intro: string
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    priceUnitario: number | null
    unidad: Unit
    total: number | null
  }[]
  bloques: { titulo: string; nodos: NodoFormat[] }[]
  total: number | null
  firmante: { nombre: string; cargo: string; telefono: string } | null
  pie: { line: string; web: string }
  /** Variables conocidas sin valor: quedan como {{x}}. */
  faltantes: NameVariable[]
  /** Nombres entre llaves que no son variables (mal escritos): quedan como están. */
  desconocidas: string[]
}

function formatCapacity(capacity: number | null | undefined): string {
  if (capacity === null || capacity === undefined) return ''
  return String(capacity).replace('.', ',')
}

/** Valor de cada variable de plantilla para esta cotización. */
export function valuesVariables(source: SourceDocument): Partial<Record<NameVariable, string>> {
  const datos = readData(source.cotizacion.datos)
  return {
    numero: source.cotizacion.numero === null ? '' : String(source.cotizacion.numero),
    capacidad: formatCapacity(source.equipo?.capacidad_tn),
    equipo_descripcion: source.equipo?.descripcion ?? '',
    validez_dias: String(source.cotizacion.validez_dias),
    ubicacion: datos.ubicacion,
    horario: datos.horario,
    plazo_entrega: datos.plazo_entrega,
    duracion_estimada: datos.duracion_estimada,
    forma_pago: datos.forma_pago,
    disponibilidad: datos.disponibilidad,
    indice_base: datos.indice_base || source.empresa.indice_base,
    proxima_actualizacion: datos.proxima_actualizacion || source.empresa.proxima_actualizacion,
  }
}

const redondear = (value: number) => Math.round(value * 100) / 100

/** "F.F.." → "F.F." (el valor ya terminaba en punto y la plantilla agrega otro). No toca "...". */
export function colapsarPuntoDoble(texto: string): string {
  return texto.replace(/(?<!\.)\.\.(?!\.)/g, '.')
}

export function buildDocument(source: SourceDocument): DocumentQuote {
  const values = valuesVariables(source)
  const faltantes = new Set<NameVariable>()
  const desconocidas = new Set<string>()
  const registerDesconocidas = (texto: string) => {
    for (const nombre of variablesDesconocidas(texto)) desconocidas.add(nombre)
  }
  // Todo texto resuelto pasa por acá (asunto, intro, títulos, ítems y cada segmento de los bloques).
  const replace = (texto: string) => {
    const result = resolverVariables(texto, values)
    for (const nombre of result.faltantes) faltantes.add(nombre)
    return colapsarPuntoDoble(result.texto)
  }
  const resolver = (texto: string) => {
    registerDesconocidas(texto)
    return replace(texto)
  }
  // Primero el formato y después las variables: un valor cargado (con saltos de línea, "- " o "**")
  // no cambia la estructura del bloque. Las desconocidas se buscan en el texto entero por si cruzan un "**" o un salto.
  const resolverBlock = (content: string): NodoFormat[] => {
    registerDesconocidas(content)
    return parsearFormat(content).map((nodo) => ({
      ...nodo,
      segmentos: nodo.segmentos.map((segmento) => ({ ...segmento, texto: replace(segmento.texto) })),
    }))
  }

  const items = [...source.items]
    .sort((a, b) => a.orden - b.orden)
    .map((item) => ({
      orden: item.orden,
      seccion: item.seccion,
      descripcion: resolver(item.descripcion),
      cantidad: item.cantidad,
      priceUnitario: item.precio_unitario,
      unidad: item.unidad,
      total: item.precio_unitario === null ? null : redondear(item.cantidad * item.precio_unitario),
    }))

  const todosWithPrice = items.length > 0 && items.every((item) => item.total !== null)
  const total =
    source.cotizacion.mostrar_total && todosWithPrice
      ? redondear(items.reduce((sum, item) => sum + (item.total ?? 0), 0))
      : null

  const { empresa: company } = source

  return {
    numero: source.cotizacion.numero,
    formato: source.cotizacion.formato,
    encabezadoFecha: headerDate(company.ciudad, source.cotizacion.fecha),
    destinatario: {
      razonSocial: source.cliente.razon_social,
      cuit: source.cliente.cuit ? formatCuit(source.cliente.cuit) : null,
      atencion: source.contacto?.nombre || null,
      email: source.contacto?.email || null,
    },
    asunto: resolver(source.cotizacion.asunto),
    intro: resolver(source.cotizacion.intro),
    items,
    // Un bloque oculto sigue guardado en la cotización (para mostrarlo de nuevo tal cual), pero no sale en el PDF:
    // se filtra antes de resolver, así sus variables no figuran como faltantes ni como mal escritas.
    bloques: source.cotizacion.bloques
      .filter((block) => !block.hidden)
      .map((block) => ({
        titulo: resolver(block.titulo),
        nodos: resolverBlock(block.contenido),
      })),
    total,
    firmante: source.firmante,
    pie: { line: lineFooter(company), web: company.web },
    faltantes: [...faltantes],
    desconocidas: [...desconocidas],
  }
}
