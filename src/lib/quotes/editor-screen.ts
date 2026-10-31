// src/lib/quotes/editor-screen.ts
// Reglas de la pantalla del editor que no son parte del estado (eso vive en editor.ts): valores por defecto, qué
// campos de "Datos de esta cotización" se muestran, ids de los campos y el resumen del encabezado.
// Puro: lo usan las páginas, los componentes y Vitest.
import { isMonth, formatShortDate, monthInLetters, addDays } from '@/lib/format/dates'
import { FORMATS, type Format } from '@/lib/templates/content'
import { usedVariables, type NameVariable } from '@/lib/templates/variables'
import { FIELDS_DATA, type FieldData } from './data'
import { applyTemplate } from './editor/state'
import { hasChanges } from './editor/validation'
import type { ActionEditor, CatalogsEditor, StatusEditor, TemplateEditor } from './editor/types'

/** Un contacto del cliente, para el "Atte.". */
export type ContactEditor = { id: string; nombre: string; email: string }

/** El dispatch del reducer del editor, tal como lo reciben las tarjetas. */
export type EditorDispatch = (action: ActionEditor) => void

/**
 * Ids de los campos del editor (únicos en la página). Los usan las etiquetas, el foco del primer error y la franja
 * de pendientes (Task 12) para llevar el foco al campo.
 */
export const ID_FIELD = {
  cliente: 'cotizacion-cliente',
  contacto: 'cotizacion-contacto',
  plantilla: 'cotizacion-plantilla',
  equipo: 'cotizacion-equipo',
  firmante: 'cotizacion-firmante',
  fecha: 'cotizacion-fecha',
  validity: 'cotizacion-validez',
  proximaActualizacion: 'cotizacion-proxima-actualizacion',
  asunto: 'cotizacion-asunto',
  intro: 'cotizacion-intro',
} as const

export function idFieldData(field: FieldData): string {
  return `cotizacion-dato-${field}`
}

/** Dónde se completa cada variable (para llevar el foco desde la franja de pendientes); null si no se carga acá. */
export function idFieldVariable(name: NameVariable): string | null {
  switch (name) {
    case 'numero':
      return null
    case 'capacidad':
    case 'equipo_descripcion':
      return ID_FIELD.equipo
    case 'validez_dias':
      return ID_FIELD.validity
    case 'proxima_actualizacion':
      return ID_FIELD.proximaActualizacion
    default:
      return idFieldData(name)
  }
}

const byName = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')

/** Firmante de una cotización nueva (decisión 9): el de la última creada si sigue activo; si no, el primero activo. */
export function defaultSigner(signers: CatalogsEditor['firmantes'], lastId: string | null): string {
  const active = signers.filter((signer) => signer.activo)
  if (lastId && active.some((signer) => signer.id === lastId)) return lastId
  return [...active].sort(byName)[0]?.id ?? ''
}

/** "Atte." al elegir un cliente (decisión 19): el último usado si sigue siendo suyo; si no, el primero por nombre. */
export function contactInitial(contacts: ContactEditor[], lastId: string | null): string {
  if (lastId && contacts.some((contact) => contact.id === lastId)) return lastId
  return [...contacts].sort(byName)[0]?.id ?? ''
}

type Texts = Pick<StatusEditor, 'asunto' | 'intro' | 'items' | 'bloques'>

/** Variables que usan los textos que salen en el PDF: asunto, introducción, ítems y bloques visibles. */
export function variablesOfText(state: Texts): Set<string> {
  const texts = [
    state.asunto,
    state.intro,
    ...state.items.map((item) => item.descripcion),
    ...state.bloques.filter((block) => !block.hidden).flatMap((block) => [block.titulo, block.contenido]),
  ]
  return new Set(texts.flatMap((text) => usedVariables(text)))
}

/**
 * Campos de datos que se muestran: los que usa el texto y los que ya tienen valor (para poder verlos y borrarlos).
 * La próxima actualización tiene su propio control (mes, decisión 7) y no sale de acá.
 */
export function fieldsDataVisible(state: Texts & Pick<StatusEditor, 'datos'>): FieldData[] {
  const used = variablesOfText(state)
  return FIELDS_DATA.filter(
    (field) => field !== 'proxima_actualizacion' && (used.has(field) || state.datos[field].trim() !== ''),
  )
}

/**
 * Lo que imprime el PDF como próxima actualización (decisión 7): el mes elegido, el texto que tenía o el de la empresa.
 * Se llama en cada render: un año a medio escribir (Chrome pasa por '0002-11', '0020-11'…) no es un mes y no tira.
 */
export function textNextUpdate(month: string, textSaved: string, textCompany: string): string {
  if (isMonth(month)) return monthInLetters(month)
  return textSaved.trim() || textCompany.trim()
}

/** 'YYYY-MM-DD' de una fecha que existe (formatFechaCorta tira con fechas imposibles como el 30/02). */
export function isDateIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    formatShortDate(value)
    return true
  } catch {
    return false
  }
}

export type HeaderSummary = {
  title: string
  detail: string
  expiration: { text: string; expired: boolean } | null
}

/**
 * Título y bajada del encabezado: "Cotización N° 112712", "Por jornada · 25/10/2026" y, solo en enviadas
 * (decisión 2), "Vence el …" o "Venció el …". Se calcula con lo que muestra la pantalla, no con lo guardado.
 */
export function headerSummary(
  state: Pick<StatusEditor, 'numero' | 'formato' | 'fecha' | 'validezDias' | 'estado'>,
  today: string,
): HeaderSummary {
  const title = state.numero === null ? 'Nueva cotización' : `Cotización N° ${state.numero}`
  const dateValid = isDateIso(state.fecha)
  const detail = [FORMATS[state.formato], dateValid ? formatShortDate(state.fecha) : null]
    .filter(Boolean)
    .join(' · ')
  const days = Number(state.validezDias)
  if (state.estado !== 'enviada' || !dateValid || !Number.isInteger(days) || days < 1 || days > 365) {
    return { title, detail, expiration: null }
  }
  const expiresOn = addDays(state.fecha, days)
  // Como v_cotizaciones: el mismo día del vencimiento todavía no cuenta como vencida.
  const expired = expiresOn < today
  return { title, detail, expiration: { text: `${expired ? 'Venció' : 'Vence'} el ${formatShortDate(expiresOn)}`, expired } }
}

export function templatesOfFormat(templates: TemplateEditor[], format: Format): TemplateEditor[] {
  return templates.filter((template) => template.formato === format)
}

/**
 * Si cambiar de plantilla pisaría algo hecho a mano (decisión 10): el contenido difiere del que deja la plantilla
 * actual (asunto, introducción, textos, ítems o validez). Sin plantilla actual, si hay algo escrito.
 */
export function changesOfContent(state: StatusEditor, current: TemplateEditor | null): boolean {
  if (current) return hasChanges(applyTemplate(state, current), state)
  return state.asunto.trim() !== '' || state.intro.trim() !== '' || state.items.length > 0 || state.bloques.length > 0
}

/** Claves de error (payloadSave) que se muestran junto a un campo del editor. */
const WITH_FIELD = [
  /^(cliente|contactoId|plantillaId|formato|equipoId|firmanteId|fecha|validezDias|proximaActualizacion|asunto|intro)$/,
  /^datos\.[a-z_]+$/,
  /^items\.\d+\.(seccion|descripcion|cantidad|precio|unidad)$/,
  /^bloques\.\d+\.(titulo|contenido)$/,
]

/** Los errores de guardado de un bloque de texto, por campo. */
export type ErrorsBlock = Partial<Record<'titulo' | 'contenido', string>>

const PATH_BLOCK = /^bloques\.(\d+)\.(titulo|contenido)$/

/**
 * Errores de guardado de los bloques de texto por clave de bloque, como erroresPorClave (grilla.ts) con los ítems:
 * las rutas ('bloques.2.contenido') usan la posición de cada bloque en lo que se mandó a guardar, así que `claves` son
 * las de esos bloques, en ese orden. La marca queda en el bloque que la tuvo aunque después se mueva.
 */
export function errorsOfBlocks(errors: Record<string, string>, keys: string[]): Record<string, ErrorsBlock> {
  const byKey: Record<string, ErrorsBlock> = {}
  for (const [path, message] of Object.entries(errors)) {
    const parts = PATH_BLOCK.exec(path)
    const key = parts ? keys[Number(parts[1])] : undefined
    if (!parts || key === undefined) continue
    byKey[key] = { ...byKey[key], [parts[2]]: message }
  }
  return byKey
}

/** Mensajes de error que no tienen un campo donde mostrarse: van en el aviso de arriba. */
export function errorsWithoutField(errors: Record<string, string>): string[] {
  return Object.entries(errors)
    .filter(([key]) => !WITH_FIELD.some((pattern) => pattern.test(key)))
    .map(([, message]) => message)
}

/**
 * Ctrl/⌘+S, el atajo de Guardar. Lo escucha el editor en `window`; un campo con borrador propio (el nombre de una
 * sección) lo aplica antes, en su keydown, para que se guarde lo que se ve.
 */
export function isSaveShortcut(key: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return (key.ctrlKey || key.metaKey) && !key.altKey && key.key.toLowerCase() === 's'
}

const comparable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Misma razón social sin importar tildes, mayúsculas ni espacios (para no ofrecer crear uno que ya aparece). */
export function sameName(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}
