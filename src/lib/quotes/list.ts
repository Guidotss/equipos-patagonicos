// src/lib/cotizaciones/lista.ts
// Lógica pura de la lista de cotizaciones: filtros en la URL, estado que se muestra, columna "Trabajo" y páginas.
import { z } from 'zod'
import { esFecha } from '@/lib/format/fechas'
import { resolverVariables, type NombreVariable } from '@/lib/plantillas/variables'
import { leerDatos } from './datos'
import { colapsarPuntoDoble } from './documento'

export const POR_PAGINA = 25

/** Estados por los que se filtra. "Vencida" no se guarda: es una enviada fuera de validez (la calcula la vista). */
export const ESTADOS_FILTRO = ['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'] as const

export type FiltrosLista = {
  q: string
  estado: '' | (typeof ESTADOS_FILTRO)[number]
  cliente: string
  desde: string
  hasta: string
  pagina: number
}

// Next entrega `?a=1&a=2` como array: vale el primero.
const primero = (valor: unknown) => (Array.isArray(valor) ? valor[0] : valor)

// Solo dígitos: '1e3' o '2.5' no son páginas.
const numeroDePagina = z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().min(1).max(10_000))

// La búsqueda va a la RPC como JSON. Los caracteres de control pasan a espacios (Postgres rechaza \u0000 con 22P05)
// y el límite se corta por puntos de código: `slice` cortaría un emoji a la mitad y PostgREST rechaza el JSON.
const limpiarBusqueda = (texto: string) =>
  Array.from(texto.replace(/\p{Cc}/gu, ' ').trim())
    .slice(0, 100)
    .join('')

// Cada filtro inválido o ausente cae a su valor por defecto sin romper los demás (la URL la escribe cualquiera).
const esquemaFiltros = z.object({
  q: z.preprocess(primero, z.string().transform(limpiarBusqueda)).catch(''),
  estado: z.preprocess(primero, z.enum(['', ...ESTADOS_FILTRO])).catch(''),
  cliente: z.preprocess(primero, z.uuid()).catch(''),
  // `esFecha` y no `z.iso.date()`: esa acepta el año 0000, que Postgres rechaza y rompería la búsqueda.
  desde: z.preprocess(primero, z.string().refine(esFecha)).catch(''),
  hasta: z.preprocess(primero, z.string().refine(esFecha)).catch(''),
  pagina: z.preprocess(primero, numeroDePagina).catch(1),
})

/** Lee los filtros de `searchParams`. Nunca falla; si el rango de fechas viene invertido, lo da vuelta. */
export function leerFiltros(searchParams: Record<string, string | string[] | undefined>): FiltrosLista {
  const filtros = esquemaFiltros.parse(searchParams)
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return { ...filtros, desde: filtros.hasta, hasta: filtros.desde }
  }
  return filtros
}

/**
 * Link a la lista con los filtros cambiados ('/cotizaciones?q=…&estado=…'), sin los vacíos ni la página 1.
 * Cambiar cualquier filtro (no la página) vuelve a la página 1: con el filtro nuevo, la de antes puede no existir.
 */
export function hrefConFiltros(filtros: FiltrosLista, cambios: Partial<FiltrosLista>): string {
  const cambiaFiltro = Object.keys(cambios).some((clave) => clave !== 'pagina')
  const final = { ...filtros, ...cambios, pagina: cambios.pagina ?? (cambiaFiltro ? 1 : filtros.pagina) }
  const parametros = new URLSearchParams()
  for (const clave of ['q', 'estado', 'cliente', 'desde', 'hasta'] as const) {
    if (final[clave]) parametros.set(clave, final[clave])
  }
  if (final.pagina > 1) parametros.set('pagina', String(final.pagina))
  const consulta = parametros.toString()
  return consulta ? `/cotizaciones?${consulta}` : '/cotizaciones'
}

export type EstadoVisible = 'borrador' | 'enviada' | 'vencida' | 'aprobada' | 'rechazada'

const ESTADOS_GUARDADOS = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const

/** El estado que se muestra: una enviada fuera de validez se ve como "Vencida". `vencida` sale de v_cotizaciones. */
export function estadoVisible(estado: string, vencida: boolean | null): EstadoVisible {
  if (!(ESTADOS_GUARDADOS as readonly string[]).includes(estado)) {
    throw new Error(`Estado de cotización desconocido: ${estado}`)
  }
  if (estado === 'enviada' && vencida) return 'vencida'
  return estado as EstadoVisible
}

const LLAVES = /\{\{[^{}]*\}\}/g

/**
 * "Cotización N° 112989" al comienzo del asunto (lo trae la plantilla por jornada): en la lista repite el N°.
 * Sin importar tildes ni mayúsculas, con "N°", "Nº", "N.º" o "Nro." antes del número (sin esa marca no se quita:
 * "Cotización 2 grúas…" dice algo), y el signo que lo separe del resto ("-", ":"…).
 */
const PREFIJO_NUMERO =
  /^cotizaci[oó]n\s*(?:n\s*\.?\s*[°º]|nro\.?|n[uú]mero|n\.)\s*\d+(?:[.,]\d+)*\s*(?:[-–—:,.]\s*)?/iu

/** Espacios y saltos de línea juntos, sin los de los extremos. */
const juntarEspacios = (texto: string) => texto.replace(/\s+/g, ' ').trim()

/** Un texto que tiene alguna letra o número (no solo signos, como el "." que deja "{{ubicacion}}."). */
const diceAlgo = (texto: string) => /[\p{L}\p{N}]/u.test(texto)

/**
 * Lo que dice la columna "Trabajo".
 * - Armada en la app: "{equipo} · {ubicación}" con lo que haya. Sin ninguno de los dos, el asunto con las variables
 *   que se pueden resolver con lo que trae la fila (las demás se quitan), sin el "Cotización N° …" del comienzo y con
 *   mayúscula.
 * - Cargada o directa: el asunto, que lo escribió el usuario.
 * Si no queda nada, "—".
 */
export function resumenCotizacion(fila: {
  numero: number
  origen: string
  asunto: string
  datos: unknown
  equipo: { nombre: string } | null
}): string {
  if (fila.origen !== 'app') {
    const asunto = juntarEspacios(fila.asunto)
    return diceAlgo(asunto) ? asunto : '—'
  }

  const datos = leerDatos(fila.datos)
  const equipoYLugar = [fila.equipo?.nombre ?? '', datos.ubicacion].map(juntarEspacios).filter(Boolean).join(' · ')
  if (equipoYLugar) return equipoYLugar

  // Acá no hay equipo: {{capacidad}} y {{equipo_descripcion}} se quitan como las demás que no se resuelven.
  const valores: Partial<Record<NombreVariable, string>> = { ...datos, numero: String(fila.numero) }
  const resuelto = colapsarPuntoDoble(resolverVariables(fila.asunto, valores).texto.replace(LLAVES, ''))
  const asunto = juntarEspacios(resuelto)
    .replace(/ ([.,;:])/g, '$1')
    .normalize('NFC')
    .replace(PREFIJO_NUMERO, '')
    .replace(/^\p{Ll}/u, (letra) => letra.toLocaleUpperCase('es'))
  return diceAlgo(asunto) ? asunto : '—'
}

/**
 * Páginas para el pie de la lista, siempre con 7 lugares como máximo para que los botones no salten:
 * rangoPaginas(5, 12) → [1, '…', 4, 5, 6, '…', 12]. Con 7 páginas o menos van todas. Sin páginas, [].
 */
export function rangoPaginas(actual: number, total: number): (number | '…')[] {
  if (total < 1) return []
  const desde = (inicio: number, cantidad: number) => Array.from({ length: cantidad }, (_, i) => inicio + i)
  if (total <= 7) return desde(1, total)
  const pagina = Math.min(Math.max(actual, 1), total)
  if (pagina <= 4) return [...desde(1, 5), '…', total]
  if (pagina >= total - 3) return [1, '…', ...desde(total - 4, 5)]
  return [1, '…', pagina - 1, pagina, pagina + 1, '…', total]
}
