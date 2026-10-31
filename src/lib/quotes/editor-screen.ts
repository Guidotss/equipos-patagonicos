// src/lib/cotizaciones/editor-pantalla.ts
// Reglas de la pantalla del editor que no son parte del estado (eso vive en editor.ts): valores por defecto, qué
// campos de "Datos de esta cotización" se muestran, ids de los campos y el resumen del encabezado.
// Puro: lo usan las páginas, los componentes y Vitest.
import { esMes, formatFechaCorta, mesEnLetras, sumarDias } from '@/lib/format/fechas'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { variablesUsadas, type NombreVariable } from '@/lib/plantillas/variables'
import { CAMPOS_DATOS, type CampoDatos } from './datos'
import {
  aplicarPlantilla,
  hayCambios,
  type AccionEditor,
  type CatalogosEditor,
  type EstadoEditor,
  type PlantillaEditor,
} from './editor'

/** Un contacto del cliente, para el "Atte.". */
export type ContactoEditor = { id: string; nombre: string; email: string }

/** El dispatch del reducer del editor, tal como lo reciben las tarjetas. */
export type Despachar = (accion: AccionEditor) => void

/**
 * Ids de los campos del editor (únicos en la página). Los usan las etiquetas, el foco del primer error y la franja
 * de pendientes (Task 12) para llevar el foco al campo.
 */
export const ID_CAMPO = {
  cliente: 'cotizacion-cliente',
  contacto: 'cotizacion-contacto',
  plantilla: 'cotizacion-plantilla',
  equipo: 'cotizacion-equipo',
  firmante: 'cotizacion-firmante',
  fecha: 'cotizacion-fecha',
  validez: 'cotizacion-validez',
  proximaActualizacion: 'cotizacion-proxima-actualizacion',
  asunto: 'cotizacion-asunto',
  intro: 'cotizacion-intro',
} as const

export function idCampoDato(campo: CampoDatos): string {
  return `cotizacion-dato-${campo}`
}

/** Dónde se completa cada variable (para llevar el foco desde la franja de pendientes); null si no se carga acá. */
export function idCampoVariable(nombre: NombreVariable): string | null {
  switch (nombre) {
    case 'numero':
      return null
    case 'capacidad':
    case 'equipo_descripcion':
      return ID_CAMPO.equipo
    case 'validez_dias':
      return ID_CAMPO.validez
    case 'proxima_actualizacion':
      return ID_CAMPO.proximaActualizacion
    default:
      return idCampoDato(nombre)
  }
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')

/** Firmante de una cotización nueva (decisión 9): el de la última creada si sigue activo; si no, el primero activo. */
export function firmantePorDefecto(firmantes: CatalogosEditor['firmantes'], ultimoId: string | null): string {
  const activos = firmantes.filter((firmante) => firmante.activo)
  if (ultimoId && activos.some((firmante) => firmante.id === ultimoId)) return ultimoId
  return [...activos].sort(porNombre)[0]?.id ?? ''
}

/** "Atte." al elegir un cliente (decisión 19): el último usado si sigue siendo suyo; si no, el primero por nombre. */
export function contactoInicial(contactos: ContactoEditor[], ultimoId: string | null): string {
  if (ultimoId && contactos.some((contacto) => contacto.id === ultimoId)) return ultimoId
  return [...contactos].sort(porNombre)[0]?.id ?? ''
}

type Textos = Pick<EstadoEditor, 'asunto' | 'intro' | 'items' | 'bloques'>

/** Variables que usan los textos que salen en el PDF: asunto, introducción, ítems y bloques visibles. */
export function variablesDelTexto(estado: Textos): Set<string> {
  const textos = [
    estado.asunto,
    estado.intro,
    ...estado.items.map((item) => item.descripcion),
    ...estado.bloques.filter((bloque) => !bloque.oculto).flatMap((bloque) => [bloque.titulo, bloque.contenido]),
  ]
  return new Set(textos.flatMap((texto) => variablesUsadas(texto)))
}

/**
 * Campos de datos que se muestran: los que usa el texto y los que ya tienen valor (para poder verlos y borrarlos).
 * La próxima actualización tiene su propio control (mes, decisión 7) y no sale de acá.
 */
export function camposDatosVisibles(estado: Textos & Pick<EstadoEditor, 'datos'>): CampoDatos[] {
  const usadas = variablesDelTexto(estado)
  return CAMPOS_DATOS.filter(
    (campo) => campo !== 'proxima_actualizacion' && (usadas.has(campo) || estado.datos[campo].trim() !== ''),
  )
}

/**
 * Lo que imprime el PDF como próxima actualización (decisión 7): el mes elegido, el texto que tenía o el de la empresa.
 * Se llama en cada render: un año a medio escribir (Chrome pasa por '0002-11', '0020-11'…) no es un mes y no tira.
 */
export function textoProximaActualizacion(mes: string, textoGuardado: string, textoEmpresa: string): string {
  if (esMes(mes)) return mesEnLetras(mes)
  return textoGuardado.trim() || textoEmpresa.trim()
}

/** 'YYYY-MM-DD' de una fecha que existe (formatFechaCorta tira con fechas imposibles como el 30/02). */
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  try {
    formatFechaCorta(valor)
    return true
  } catch {
    return false
  }
}

export type ResumenEncabezado = {
  titulo: string
  detalle: string
  vence: { texto: string; vencida: boolean } | null
}

/**
 * Título y bajada del encabezado: "Cotización N° 112712", "Por jornada · 25/10/2026" y, solo en enviadas
 * (decisión 2), "Vence el …" o "Venció el …". Se calcula con lo que muestra la pantalla, no con lo guardado.
 */
export function resumenEncabezado(
  estado: Pick<EstadoEditor, 'numero' | 'formato' | 'fecha' | 'validezDias' | 'estado'>,
  hoy: string,
): ResumenEncabezado {
  const titulo = estado.numero === null ? 'Nueva cotización' : `Cotización N° ${estado.numero}`
  const fechaValida = esFechaIso(estado.fecha)
  const detalle = [FORMATOS[estado.formato], fechaValida ? formatFechaCorta(estado.fecha) : null]
    .filter(Boolean)
    .join(' · ')
  const dias = Number(estado.validezDias)
  if (estado.estado !== 'enviada' || !fechaValida || !Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { titulo, detalle, vence: null }
  }
  const venceEl = sumarDias(estado.fecha, dias)
  // Como v_cotizaciones: el mismo día del vencimiento todavía no cuenta como vencida.
  const vencida = venceEl < hoy
  return { titulo, detalle, vence: { texto: `${vencida ? 'Venció' : 'Vence'} el ${formatFechaCorta(venceEl)}`, vencida } }
}

export function plantillasDeFormato(plantillas: PlantillaEditor[], formato: Formato): PlantillaEditor[] {
  return plantillas.filter((plantilla) => plantilla.formato === formato)
}

/**
 * Si cambiar de plantilla pisaría algo hecho a mano (decisión 10): el contenido difiere del que deja la plantilla
 * actual (asunto, introducción, textos, ítems o validez). Sin plantilla actual, si hay algo escrito.
 */
export function cambiosDeContenido(estado: EstadoEditor, actual: PlantillaEditor | null): boolean {
  if (actual) return hayCambios(aplicarPlantilla(estado, actual), estado)
  return estado.asunto.trim() !== '' || estado.intro.trim() !== '' || estado.items.length > 0 || estado.bloques.length > 0
}

/** Claves de error (payloadGuardar) que se muestran junto a un campo del editor. */
const CON_CAMPO = [
  /^(cliente|contactoId|plantillaId|formato|equipoId|firmanteId|fecha|validezDias|proximaActualizacion|asunto|intro)$/,
  /^datos\.[a-z_]+$/,
  /^items\.\d+\.(seccion|descripcion|cantidad|precio|unidad)$/,
  /^bloques\.\d+\.(titulo|contenido)$/,
]

/** Los errores de guardado de un bloque de texto, por campo. */
export type ErroresBloque = Partial<Record<'titulo' | 'contenido', string>>

const RUTA_BLOQUE = /^bloques\.(\d+)\.(titulo|contenido)$/

/**
 * Errores de guardado de los bloques de texto por clave de bloque, como erroresPorClave (grilla.ts) con los ítems:
 * las rutas ('bloques.2.contenido') usan la posición de cada bloque en lo que se mandó a guardar, así que `claves` son
 * las de esos bloques, en ese orden. La marca queda en el bloque que la tuvo aunque después se mueva.
 */
export function erroresDeBloques(errores: Record<string, string>, claves: string[]): Record<string, ErroresBloque> {
  const porClave: Record<string, ErroresBloque> = {}
  for (const [ruta, mensaje] of Object.entries(errores)) {
    const partes = RUTA_BLOQUE.exec(ruta)
    const clave = partes ? claves[Number(partes[1])] : undefined
    if (!partes || clave === undefined) continue
    porClave[clave] = { ...porClave[clave], [partes[2]]: mensaje }
  }
  return porClave
}

/** Mensajes de error que no tienen un campo donde mostrarse: van en el aviso de arriba. */
export function erroresSinCampo(errores: Record<string, string>): string[] {
  return Object.entries(errores)
    .filter(([clave]) => !CON_CAMPO.some((patron) => patron.test(clave)))
    .map(([, mensaje]) => mensaje)
}

/**
 * Ctrl/⌘+S, el atajo de Guardar. Lo escucha el editor en `window`; un campo con borrador propio (el nombre de una
 * sección) lo aplica antes, en su keydown, para que se guarde lo que se ve.
 */
export function esAtajoGuardar(tecla: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return (tecla.ctrlKey || tecla.metaKey) && !tecla.altKey && tecla.key.toLowerCase() === 's'
}

const comparable = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Misma razón social sin importar tildes, mayúsculas ni espacios (para no ofrecer crear uno que ya aparece). */
export function mismoNombre(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}
