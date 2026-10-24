import { formatCuit } from '@/lib/cuit'
import { encabezadoFecha } from '@/lib/format/fechas'
import type { Formato, Unidad } from '@/lib/plantillas/contenido'
import { parsearFormato, type NodoFormato } from '@/lib/plantillas/formato'
import { resolverVariables, variablesDesconocidas, type NombreVariable } from '@/lib/plantillas/variables'
import { leerDatos } from './datos'

/** Filas de la base que hacen falta para dibujar una cotización. */
export type FuenteDocumento = {
  cotizacion: {
    numero: number
    fecha: string
    formato: Formato
    asunto: string
    intro: string
    validez_dias: number
    mostrar_total: boolean
    datos: unknown
    bloques: { titulo: string; contenido: string }[]
  }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: Unidad
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

export type DocumentoCotizacion = {
  numero: number
  formato: Formato
  encabezadoFecha: string
  destinatario: { razonSocial: string; cuit: string | null; atencion: string | null; email: string | null }
  asunto: string
  intro: string
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precioUnitario: number | null
    unidad: Unidad
    total: number | null
  }[]
  bloques: { titulo: string; nodos: NodoFormato[] }[]
  total: number | null
  firmante: { nombre: string; cargo: string; telefono: string } | null
  pie: { linea: string; web: string }
  /** Variables conocidas sin valor: quedan como {{x}}. */
  faltantes: NombreVariable[]
  /** Nombres entre llaves que no son variables (mal escritos): quedan como están. */
  desconocidas: string[]
}

function formatCapacidad(capacidad: number | null | undefined): string {
  if (capacidad === null || capacidad === undefined) return ''
  return String(capacidad).replace('.', ',')
}

/** Valor de cada variable de plantilla para esta cotización. */
export function valoresVariables(fuente: FuenteDocumento): Partial<Record<NombreVariable, string>> {
  const datos = leerDatos(fuente.cotizacion.datos)
  return {
    numero: String(fuente.cotizacion.numero),
    capacidad: formatCapacidad(fuente.equipo?.capacidad_tn),
    equipo_descripcion: fuente.equipo?.descripcion ?? '',
    validez_dias: String(fuente.cotizacion.validez_dias),
    ubicacion: datos.ubicacion,
    horario: datos.horario,
    plazo_entrega: datos.plazo_entrega,
    duracion_estimada: datos.duracion_estimada,
    forma_pago: datos.forma_pago,
    disponibilidad: datos.disponibilidad,
    indice_base: datos.indice_base || fuente.empresa.indice_base,
    proxima_actualizacion: datos.proxima_actualizacion || fuente.empresa.proxima_actualizacion,
  }
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

/** "F.F.." → "F.F." (el valor ya terminaba en punto y la plantilla agrega otro). No toca "...". */
export function colapsarPuntoDoble(texto: string): string {
  return texto.replace(/(?<!\.)\.\.(?!\.)/g, '.')
}

export function armarDocumento(fuente: FuenteDocumento): DocumentoCotizacion {
  const valores = valoresVariables(fuente)
  const faltantes = new Set<NombreVariable>()
  const desconocidas = new Set<string>()
  const registrarDesconocidas = (texto: string) => {
    for (const nombre of variablesDesconocidas(texto)) desconocidas.add(nombre)
  }
  // Todo texto resuelto pasa por acá (asunto, intro, títulos, ítems y cada segmento de los bloques).
  const reemplazar = (texto: string) => {
    const resultado = resolverVariables(texto, valores)
    for (const nombre of resultado.faltantes) faltantes.add(nombre)
    return colapsarPuntoDoble(resultado.texto)
  }
  const resolver = (texto: string) => {
    registrarDesconocidas(texto)
    return reemplazar(texto)
  }
  // Primero el formato y después las variables: un valor cargado (con saltos de línea, "- " o "**")
  // no cambia la estructura del bloque. Las desconocidas se buscan en el texto entero por si cruzan un "**" o un salto.
  const resolverBloque = (contenido: string): NodoFormato[] => {
    registrarDesconocidas(contenido)
    return parsearFormato(contenido).map((nodo) => ({
      ...nodo,
      segmentos: nodo.segmentos.map((segmento) => ({ ...segmento, texto: reemplazar(segmento.texto) })),
    }))
  }

  const items = [...fuente.items]
    .sort((a, b) => a.orden - b.orden)
    .map((item) => ({
      orden: item.orden,
      seccion: item.seccion,
      descripcion: resolver(item.descripcion),
      cantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      unidad: item.unidad,
      total: item.precio_unitario === null ? null : redondear(item.cantidad * item.precio_unitario),
    }))

  const todosConPrecio = items.length > 0 && items.every((item) => item.total !== null)
  const total =
    fuente.cotizacion.mostrar_total && todosConPrecio
      ? redondear(items.reduce((suma, item) => suma + (item.total ?? 0), 0))
      : null

  const { empresa } = fuente
  const linea = [empresa.direccion, empresa.ciudad, 'Argentina', empresa.telefono && `Tel. ${empresa.telefono}`, empresa.email]
    .filter(Boolean)
    .join(' - ')

  return {
    numero: fuente.cotizacion.numero,
    formato: fuente.cotizacion.formato,
    encabezadoFecha: encabezadoFecha(empresa.ciudad, fuente.cotizacion.fecha),
    destinatario: {
      razonSocial: fuente.cliente.razon_social,
      cuit: fuente.cliente.cuit ? formatCuit(fuente.cliente.cuit) : null,
      atencion: fuente.contacto?.nombre || null,
      email: fuente.contacto?.email || null,
    },
    asunto: resolver(fuente.cotizacion.asunto),
    intro: resolver(fuente.cotizacion.intro),
    items,
    bloques: fuente.cotizacion.bloques.map((bloque) => ({
      titulo: resolver(bloque.titulo),
      nodos: resolverBloque(bloque.contenido),
    })),
    total,
    firmante: fuente.firmante,
    pie: { linea, web: empresa.web },
    faltantes: [...faltantes],
    desconocidas: [...desconocidas],
  }
}
