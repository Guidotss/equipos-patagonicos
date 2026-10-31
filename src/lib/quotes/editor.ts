// src/lib/cotizaciones/editor.ts
// Estado del editor de cotizaciones y todo lo que se calcula a partir de él, sin React ni Supabase: el componente
// lo usa con useReducer, la Server Action valida con payloadGuardar y la vista previa arma el documento con
// fuenteDesdeEditor. Se puede importar desde el navegador.
import { z } from 'zod'
import { isDate, isMonth, todayArgentina, monthInLetters } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import { errorsByPath } from '@/lib/forms'
import {
  UNIDADES,
  readBlocks,
  type Block,
  type Format,
  type ItemTemplate,
  type Unit,
} from '@/lib/templates/content'
import type { NameVariable } from '@/lib/templates/variables'
import { isUuid } from '@/lib/validation'
import { schemaData, schemaItem, readData, type FieldData, type DataQuote } from './data'
import { buildDocument, type SourceDocument } from './document'

// ---------------------------------------------------------------------------------------------------------------
// Tipos

/** Una fila de la grilla. Cantidad y precio quedan como texto mientras se escriben ("39.000.000", "1,5"). */
export type ItemEditor = {
  clave: string
  seccion: string
  descripcion: string
  cantidad: string
  precio: string
  unidad: Unit
}
export type BlockEditor = { clave: string; titulo: string; contenido: string; hidden: boolean }

export type StatusEditor = {
  id: string | null
  version: string | null
  numero: number | null
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'
  origen: 'app' | 'importada' | 'directa'
  cliente: { id: string; razon_social: string; cuit: string | null } | null
  contactoId: string // '' = Sin Atte.
  templateId: string
  formato: Format
  equipoId: string
  firmanteId: string
  fecha: string // 'YYYY-MM-DD'
  validezDias: string
  mostrarTotal: boolean
  proximaActualizacion: string // 'YYYY-MM' o ''
  asunto: string
  intro: string
  datos: DataQuote // incluye proxima_actualizacion (texto) e indice_base
  items: ItemEditor[]
  bloques: BlockEditor[]
  replacesA: string | null // solo cuenta al crear
}

export type TemplateEditor = {
  id: string
  nombre: string
  formato: Format
  asunto: string
  intro: string
  validez_dias: number
  bloques: Block[]
  items: ItemTemplate[]
}

export type CatalogsEditor = {
  plantillas: TemplateEditor[]
  equipos: { id: string; nombre: string; capacidad_tn: number | null; descripcion: string; activo: boolean }[]
  firmantes: { id: string; nombre: string; cargo: string; telefono: string; activo: boolean }[]
  empresa: SourceDocument['empresa']
}

/**
 * Lo que la página del editor lee de una cotización:
 * `supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', id).maybeSingle()`.
 * Los envíos vienen sin orden (la página los ordena por `enviada_at`); estadoDesdeFila no los usa, pero la página
 * los necesita para el historial y para avisar si se aprueba algo editado después del último envío.
 */
export const SELECT_EDITOR = `id, numero, estado, origen, fecha, formato, asunto, intro, datos, bloques, validez_dias,
  mostrar_total, fecha_proxima_actualizacion, contacto_id, plantilla_id, equipo_id, firmante_id, reemplaza_a,
  fecha_aprobacion, archivo_original_path, updated_at,
  cliente:clientes(id, razon_social, cuit),
  items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad),
  envios:cotizacion_envios(id, enviada_at)`

/** La fila que devuelve la consulta de SELECT_EDITOR (editor.test.ts comprueba que el tipo inferido encaja). */
export type RowEditor = {
  id: string
  numero: number
  estado: string
  origen: string
  fecha: string
  formato: string
  asunto: string
  intro: string
  datos: unknown
  bloques: unknown
  validez_dias: number
  mostrar_total: boolean
  fecha_proxima_actualizacion: string | null
  contacto_id: string | null
  plantilla_id: string | null
  equipo_id: string | null
  firmante_id: string | null
  reemplaza_a: string | null
  fecha_aprobacion: string | null
  archivo_original_path: string | null
  updated_at: string
  cliente: { id: string; razon_social: string; cuit: string | null }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: string
  }[]
  envios: { id: string; enviada_at: string }[]
}

export type ActionEditor =
  | { tipo: 'campo'; campo: FieldEditor; value: string }
  | { tipo: 'dato'; campo: FieldData; value: string }
  | { tipo: 'mostrarTotal'; value: boolean }
  | { tipo: 'cliente'; cliente: StatusEditor['cliente']; contactoId: string }
  | { tipo: 'plantilla'; plantilla: TemplateEditor }
  | { tipo: 'agregarItem'; despuesOf?: string; seccion?: string }
  | { tipo: 'item'; clave: string; changes: Partial<Omit<ItemEditor, 'clave'>> }
  | { tipo: 'moverItem'; desde: number; hasta: number }
  | { tipo: 'quitarItem'; clave: string }
  | { tipo: 'duplicarItem'; clave: string }
  | { tipo: 'renombrarSeccion'; clave: string; seccion: string }
  | { tipo: 'agregarSeccion'; nombre: string }
  | { tipo: 'bloque'; clave: string; changes: Partial<Omit<BlockEditor, 'clave'>> }
  | { tipo: 'moverBloque'; clave: string; direccion: -1 | 1 }
  | { tipo: 'restaurarBloques'; bloques: Block[] }
  | { tipo: 'guardado'; id: string; version: string; numero: number }
  | { tipo: 'reemplazar'; estado: StatusEditor }

/** Campos de texto de la cabecera que se cambian con la acción 'campo'. */
export type FieldEditor =
  | 'contactoId'
  | 'equipoId'
  | 'firmanteId'
  | 'fecha'
  | 'validezDias'
  | 'proximaActualizacion'
  | 'asunto'
  | 'intro'

export type PayloadSave = { p_datos: Record<string, unknown>; p_items: Record<string, unknown>[] }

export type PendingList = {
  variables: NameVariable[]
  desconocidas: string[]
  itemsWithoutPrice: number
  withoutItems: boolean
}

/**
 * El texto de private.exigir_version (supabase/migrations/20261025100200_cotizaciones_estados.sql) cuando la versión
 * que vio la pantalla ya no es la de la fila. El servicio da el mismo error antes de generar un PDF y el editor lo
 * reconoce para ofrecer "Recargar" (acciones-estado.ts): si cambia en la base, cambia acá.
 */
export const MESSAGE_CONFLICT = 'La cotización cambió desde que la abriste; volvé a intentarlo'

// ---------------------------------------------------------------------------------------------------------------
// Texto de los números de la grilla

let keysWithoutCrypto = 0

/** Clave estable de una fila o un bloque (para React y para arrastrar); no se guarda. */
export function newKey(): string {
  // crypto.randomUUID solo existe en un contexto seguro (HTTPS o localhost): el dev server abierto desde el celular
  // por la IP de la red no lo tiene. La clave no se guarda: alcanza con que no se repita en la página.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  keysWithoutCrypto += 1
  return `clave-${keysWithoutCrypto}-${Math.random().toString(36).slice(2)}`
}

const withoutDecimals = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' })
const withDecimals = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** Precio guardado → texto de la celda: "39.000.000" o "1.950.000,50". parsePrecio lo vuelve a leer igual. */
export function textPrice(price: number): string {
  return Number.isInteger(price) ? withoutDecimals.format(price) : withDecimals.format(price)
}

/** Cantidad guardada → texto de la celda, con coma decimal: 1 → "1", 1.5 → "1,5". */
export function textQuantity(cantidad: number): string {
  return String(cantidad).replace('.', ',')
}

// ---------------------------------------------------------------------------------------------------------------
// Crear el estado

const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const
const ORIGENES = ['app', 'importada', 'directa'] as const
const FORMATS_EDITOR = ['mensual', 'jornada'] as const satisfies readonly Format[]

/** La base garantiza estos valores (CHECK): uno distinto es un error de programación. */
function unoOf<const T extends readonly string[]>(value: string, options: T, error: string): T[number] {
  if (!options.includes(value)) throw new Error(`${error}: ${value}`)
  return value as T[number]
}

function blocksOfEditor(bloques: Block[]): BlockEditor[] {
  return bloques.map((block) => ({
    clave: newKey(),
    titulo: block.titulo,
    contenido: block.contenido,
    hidden: block.hidden,
  }))
}

/** Una cotización nueva: borrador de la app, con la plantilla aplicada si hay una. */
export function statusNew(args: {
  plantilla: TemplateEditor | null
  firmanteId: string
  today: string
}): StatusEditor {
  const empty: StatusEditor = {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: null,
    contactoId: '',
    templateId: '',
    formato: 'mensual',
    equipoId: '',
    firmanteId: args.firmanteId,
    fecha: args.today,
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: '',
    intro: '',
    datos: readData({}),
    items: [],
    bloques: [],
    replacesA: null,
  }
  return args.plantilla ? applyTemplate(empty, args.plantilla) : empty
}

/** El estado de una cotización guardada, tal como la lee la página (ver SELECT_EDITOR). */
export function statusFromRow(row: RowEditor): StatusEditor {
  return {
    id: row.id,
    version: row.updated_at,
    numero: row.numero,
    estado: unoOf(row.estado, ESTADOS, 'Estado desconocido'),
    origen: unoOf(row.origen, ORIGENES, 'Origen desconocido'),
    cliente: { id: row.cliente.id, razon_social: row.cliente.razon_social, cuit: row.cliente.cuit },
    contactoId: row.contacto_id ?? '',
    templateId: row.plantilla_id ?? '',
    formato: unoOf(row.formato, FORMATS_EDITOR, 'Formato desconocido'),
    equipoId: row.equipo_id ?? '',
    firmanteId: row.firmante_id ?? '',
    fecha: row.fecha,
    validezDias: String(row.validez_dias),
    mostrarTotal: row.mostrar_total,
    // La columna guarda el primer día del mes ('2026-11-01'); el control es <input type="month">.
    proximaActualizacion: row.fecha_proxima_actualizacion?.slice(0, 7) ?? '',
    asunto: row.asunto,
    intro: row.intro,
    datos: readData(row.datos),
    items: [...row.items]
      .sort((a, b) => a.orden - b.orden)
      .map((item) => ({
        clave: newKey(),
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: textQuantity(item.cantidad),
        precio: item.precio_unitario === null ? '' : textPrice(item.precio_unitario),
        unidad: unoOf(item.unidad, UNIDADES, 'Unidad desconocida'),
      })),
    bloques: blocksOfEditor(readBlocks(row.bloques)),
    replacesA: row.reemplaza_a,
  }
}

/**
 * Precarga lo que trae la plantilla: formato, asunto, introducción, textos, validez e ítems sin precio.
 * Cliente, contacto, equipo, firmante, fecha, datos, próxima actualización y "mostrar total" no cambian.
 */
export function applyTemplate(estado: StatusEditor, template: TemplateEditor): StatusEditor {
  return {
    ...estado,
    templateId: template.id,
    formato: template.formato,
    asunto: template.asunto,
    intro: template.intro,
    validezDias: String(template.validez_dias),
    items: template.items.map((item) => ({
      clave: newKey(),
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: textQuantity(item.cantidad),
      precio: '',
      unidad: item.unidad,
    })),
    bloques: blocksOfEditor(template.bloques),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reducer

function insert<T>(list: T[], position: number, element: T): T[] {
  return [...list.slice(0, position), element, ...list.slice(position)]
}

/** Saca el elemento de `desde` y lo pone en `hasta` (como arrayMove de dnd-kit). */
function move<T>(list: T[], desde: number, hasta: number): T[] {
  const copy = [...list]
  const [element] = copy.splice(desde, 1)
  copy.splice(hasta, 0, element)
  return copy
}

/** Fila vacía: copia sección y unidad de la fila de referencia; sin referencia, la unidad típica del formato. */
function itemNew(estado: StatusEditor, referencia: ItemEditor | undefined, seccion?: string): ItemEditor {
  return {
    clave: newKey(),
    seccion: seccion ?? referencia?.seccion ?? '',
    descripcion: '',
    cantidad: '1',
    precio: '',
    unidad: referencia?.unidad ?? (estado.formato === 'jornada' ? 'JORNADA' : 'UNIDAD'),
  }
}

function moveItem(items: ItemEditor[], desde: number, hasta: number): ItemEditor[] {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length
  if (desde === hasta || !valid(desde) || !valid(hasta)) return items
  const list = move(items, desde, hasta)
  const previous = list[hasta - 1]
  const next = list[hasta + 1]
  const moved = list[hasta]
  // Las secciones son rachas de filas consecutivas. Si la fila cae en el medio de otro grupo, se suma a ese grupo:
  // si conservara la suya, partiría el grupo en dos. En el borde entre dos grupos conserva su sección.
  if (previous && next && previous.seccion === next.seccion && moved.seccion !== previous.seccion) {
    list[hasta] = { ...moved, seccion: previous.seccion }
  }
  return list
}

/** Renombra la racha de filas consecutivas con la misma sección que la fila `clave` (no otras rachas iguales). */
function renameSection(items: ItemEditor[], clave: string, seccion: string): ItemEditor[] {
  const index = items.findIndex((item) => item.clave === clave)
  if (index < 0) return items
  const actual = items[index].seccion
  let home = index
  while (home > 0 && items[home - 1].seccion === actual) home--
  let fin = index
  while (fin < items.length - 1 && items[fin + 1].seccion === actual) fin++
  return items.map((item, i) => (i >= home && i <= fin ? { ...item, seccion } : item))
}

/**
 * Todas las transiciones del editor. Pura salvo las claves nuevas (crypto.randomUUID). Si la acción no cambia nada
 * (mover fuera de rango, una clave que ya no existe), devuelve el mismo estado.
 */
export function reduceEditor(estado: StatusEditor, accion: ActionEditor): StatusEditor {
  switch (accion.tipo) {
    case 'campo':
      if (accion.campo === 'proximaActualizacion') {
        // Un solo control llena la fecha y el texto del PDF (decisión 7). Vaciarlo borra también el texto: el PDF
        // vuelve al valor de la empresa, igual antes y después de recargar. Mientras no se toque, el texto que trajo
        // la fila se conserva.
        return {
          ...estado,
          proximaActualizacion: accion.value,
          datos: { ...estado.datos, proxima_actualizacion: isMonth(accion.value) ? monthInLetters(accion.value) : '' },
        }
      }
      return { ...estado, [accion.campo]: accion.value }
    case 'dato':
      return { ...estado, datos: { ...estado.datos, [accion.campo]: accion.value } }
    case 'mostrarTotal':
      return { ...estado, mostrarTotal: accion.value }
    case 'cliente':
      return { ...estado, cliente: accion.cliente, contactoId: accion.contactoId }
    case 'plantilla':
      return applyTemplate(estado, accion.plantilla)
    case 'agregarItem': {
      const index = accion.despuesOf ? estado.items.findIndex((item) => item.clave === accion.despuesOf) : -1
      const referencia = index >= 0 ? estado.items[index] : estado.items.at(-1)
      const nuevo = itemNew(estado, referencia, accion.seccion)
      return { ...estado, items: insert(estado.items, index >= 0 ? index + 1 : estado.items.length, nuevo) }
    }
    case 'item':
      if (!estado.items.some((item) => item.clave === accion.clave)) return estado
      return {
        ...estado,
        items: estado.items.map((item) =>
          item.clave === accion.clave ? { ...item, ...accion.changes, clave: item.clave } : item,
        ),
      }
    case 'moverItem': {
      const items = moveItem(estado.items, accion.desde, accion.hasta)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'quitarItem':
      if (!estado.items.some((item) => item.clave === accion.clave)) return estado
      return { ...estado, items: estado.items.filter((item) => item.clave !== accion.clave) }
    case 'duplicarItem': {
      const index = estado.items.findIndex((item) => item.clave === accion.clave)
      if (index < 0) return estado
      const copy = { ...estado.items[index], clave: newKey() }
      return { ...estado, items: insert(estado.items, index + 1, copy) }
    }
    case 'renombrarSeccion': {
      const items = renameSection(estado.items, accion.clave, accion.seccion)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'agregarSeccion': {
      const nuevo = itemNew(estado, estado.items.at(-1), accion.nombre.trim() || 'Nueva sección')
      return { ...estado, items: [...estado.items, nuevo] }
    }
    case 'bloque':
      if (!estado.bloques.some((block) => block.clave === accion.clave)) return estado
      return {
        ...estado,
        bloques: estado.bloques.map((block) =>
          block.clave === accion.clave ? { ...block, ...accion.changes, clave: block.clave } : block,
        ),
      }
    case 'moverBloque': {
      const index = estado.bloques.findIndex((block) => block.clave === accion.clave)
      const destination = index + accion.direccion
      if (index < 0 || destination < 0 || destination >= estado.bloques.length) return estado
      return { ...estado, bloques: move(estado.bloques, index, destination) }
    }
    case 'restaurarBloques':
      return { ...estado, bloques: blocksOfEditor(accion.bloques) }
    case 'guardado':
      return { ...estado, id: accion.id, version: accion.version, numero: accion.numero }
    case 'reemplazar':
      return accion.estado
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Forma de lo que llega del navegador

const textFree = z.string().max(20_000)
const idOptional = z.union([z.literal(''), z.uuid()])

/**
 * La forma de EstadoEditor, sin reglas de negocio (un precio mal escrito o la falta de cliente pasan). Sirve para
 * rechazar con 400 un cuerpo que no es un estado del editor (POST /cotizaciones/vista-previa) antes de usarlo; las
 * reglas para guardar están en payloadGuardar. Los ids son uuid o '' porque el servidor los relee de la base.
 */
export const schemaStatusEditor = z.object({
  id: z.uuid().nullable(),
  version: z.string().max(64).nullable(),
  numero: z.number().int().positive().nullable(),
  estado: z.enum(ESTADOS),
  origen: z.enum(ORIGENES),
  cliente: z.object({ id: z.uuid(), razon_social: textFree, cuit: z.string().nullable() }).nullable(),
  contactoId: idOptional,
  templateId: idOptional,
  formato: z.enum(FORMATS_EDITOR),
  equipoId: idOptional,
  firmanteId: idOptional,
  fecha: z.string().max(10),
  validezDias: z.string().max(10),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string().max(7),
  asunto: textFree,
  intro: textFree,
  datos: z.object({
    ubicacion: textFree,
    horario: textFree,
    plazo_entrega: textFree,
    duracion_estimada: textFree,
    forma_pago: textFree,
    disponibilidad: textFree,
    indice_base: textFree,
    proxima_actualizacion: textFree,
  }),
  items: z
    .array(
      z.object({
        clave: z.string().max(64),
        seccion: textFree,
        descripcion: textFree,
        cantidad: z.string().max(30),
        precio: z.string().max(30),
        unidad: z.enum(UNIDADES),
      }),
    )
    .max(500),
  bloques: z
    .array(z.object({ clave: z.string().max(64), titulo: textFree, contenido: textFree, hidden: z.boolean() }))
    .max(100),
  replacesA: z.uuid().nullable(),
}) satisfies z.ZodType<StatusEditor>

// ---------------------------------------------------------------------------------------------------------------
// Guardar

const MESSAGE_VALIDITY = 'Ingresá una validez de 1 a 365 días'
const MESSAGE_MONTH = 'Elegí un mes válido'
const MESSAGE_DATE = 'Ingresá una fecha válida'

/** El texto de la próxima actualización en el PDF: el mes elegido manda; sin mes, queda el texto que hubiera. */
function nextUpdateInText(month: string, textCurrent: string): string {
  return isMonth(month) ? monthInLetters(month) : textCurrent
}

function uuidOptional(message: string) {
  return z
    .string(message)
    .refine((value) => value === '' || isUuid(value), message)
    .transform((value) => value || null)
}

const clientChosen = z.unknown().transform((cliente, ctx) => {
  const id = cliente !== null && typeof cliente === 'object' ? (cliente as { id?: unknown }).id : undefined
  if (typeof id === 'string' && isUuid(id)) return id
  ctx.addIssue({ code: 'custom', message: 'Elegí el cliente' })
  return z.NEVER
})

const quantityWritten = z
  .string('Ingresá la cantidad')
  .transform((texto, ctx) => {
    const cantidad = parsePrice(texto)
    if (cantidad === null) {
      ctx.addIssue({ code: 'custom', message: texto.trim() ? 'Cantidad inválida' : 'Ingresá la cantidad' })
      return z.NEVER
    }
    return cantidad
  })
  .pipe(schemaItem.shape.cantidad)

const priceWritten = z
  .string('Precio inválido')
  .transform((texto, ctx) => {
    if (texto.trim() === '') return null
    const price = parsePrice(texto)
    if (price === null) {
      ctx.addIssue({ code: 'custom', message: 'Precio inválido' })
      return z.NEVER
    }
    return price
  })
  .pipe(schemaItem.shape.precio_unitario)

// Las reglas de cada celda son las de esquemaItem; las claves de error usan los nombres de la grilla
// ('items.2.precio'), no los de la base ('precio_unitario').
const schemaItemEditor = z
  .object({
    seccion: schemaItem.shape.seccion,
    descripcion: schemaItem.shape.descripcion,
    cantidad: quantityWritten,
    precio: priceWritten,
    unidad: schemaItem.shape.unidad,
  })
  .superRefine((item, ctx) => {
    // El total de la fila es numeric(16,2) en la base: si no entra, la base contestaría con un error de desborde.
    if (item.precio !== null && item.cantidad * item.precio >= 1e14) {
      ctx.addIssue({ code: 'custom', path: ['precio'], message: 'El total de la fila es demasiado grande' })
    }
  })
  .transform((item) => ({
    seccion: item.seccion,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio,
    unidad: item.unidad,
  }))

const schemaBlockEditor = z.object({
  titulo: z.string().trim().max(200, 'Máximo 200 caracteres'),
  // Sin trim: dos espacios al principio de una línea son una subviñeta.
  contenido: z.string().max(10_000, 'Máximo 10.000 caracteres'),
  hidden: z.boolean(),
})

// Las claves son las de EstadoEditor, así erroresPorRuta devuelve 'cliente', 'validezDias', 'items.2.precio'…
const schemaEditor = z.object({
  cliente: clientChosen,
  contactoId: uuidOptional('Contacto inválido'),
  templateId: uuidOptional('Plantilla inválida'),
  formato: z.enum(FORMATS_EDITOR, { error: 'Elegí el formato' }),
  equipoId: uuidOptional('Equipo inválido'),
  firmanteId: uuidOptional('Firmante inválido'),
  fecha: z.string(MESSAGE_DATE).refine(isDate, MESSAGE_DATE),
  validezDias: z
    .string(MESSAGE_VALIDITY)
    .trim()
    .regex(/^\d{1,3}$/, MESSAGE_VALIDITY)
    .transform(Number)
    .refine((dias) => dias >= 1 && dias <= 365, MESSAGE_VALIDITY),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string(MESSAGE_MONTH).refine((month) => month === '' || isMonth(month), MESSAGE_MONTH),
  asunto: z.string().trim().max(500, 'Máximo 500 caracteres'),
  intro: z.string().trim().max(5000, 'Máximo 5000 caracteres'),
  datos: schemaData,
  items: z.array(schemaItemEditor),
  bloques: z.array(schemaBlockEditor),
  replacesA: z
    .string()
    .nullable()
    .refine((id) => id === null || isUuid(id), 'Cotización anterior inválida'),
})

/**
 * Valida el estado y arma los parámetros de guardar_cotizacion. p_datos lleva la cabecera COMPLETA porque la RPC
 * pisa con vacío lo que no se manda. Los uuid vacíos van como null; el mes elegido llena
 * fecha_proxima_actualizacion ('YYYY-MM-01') y el texto datos.proxima_actualizacion; los bloques ocultos viajan
 * con oculto: true. Lo usan la Server Action (que no confía en lo que manda el navegador) y hayCambios.
 */
export function payloadSave(
  estado: StatusEditor,
): { ok: true; payload: PayloadSave } | { ok: false; errors: Record<string, string> } {
  const result = schemaEditor.safeParse(estado)
  if (!result.success) return { ok: false, errors: errorsByPath(result.error) }
  const valid = result.data
  return {
    ok: true,
    payload: {
      p_datos: {
        cliente_id: valid.cliente,
        contacto_id: valid.contactoId,
        formato: valid.formato,
        plantilla_id: valid.templateId,
        equipo_id: valid.equipoId,
        firmante_id: valid.firmanteId,
        fecha: valid.fecha,
        asunto: valid.asunto,
        intro: valid.intro,
        datos: {
          ...valid.datos,
          proxima_actualizacion: nextUpdateInText(
            valid.proximaActualizacion,
            valid.datos.proxima_actualizacion,
          ),
        },
        bloques: valid.bloques,
        validez_dias: valid.validezDias,
        mostrar_total: valid.mostrarTotal,
        fecha_proxima_actualizacion: valid.proximaActualizacion ? `${valid.proximaActualizacion}-01` : null,
        reemplaza_a: valid.replacesA,
      },
      p_items: valid.items,
    },
  }
}

/** Huella de lo que se guardaría. Con algo a medio escribir (un precio inválido, sin cliente) se usa el contenido. */
function fingerprint(estado: StatusEditor): string {
  const result = payloadSave(estado)
  if (result.ok) return `payload:${JSON.stringify(result.payload)}`
  return `estado:${JSON.stringify({
    ...estado,
    items: estado.items.map((item) => [item.seccion, item.descripcion, item.cantidad, item.precio, item.unidad]),
    bloques: estado.bloques.map((block) => [block.titulo, block.contenido, block.hidden]),
  })}`
}

/**
 * true si guardar cambiaría algo. Compara lo que se mandaría a la base, no las claves ni cómo está escrito
 * ("39000000" y "39.000.000" son el mismo precio).
 */
export function hasChanges(saved: StatusEditor, actual: StatusEditor): boolean {
  return fingerprint(saved) !== fingerprint(actual)
}

// ---------------------------------------------------------------------------------------------------------------
// Documento y pendientes

/**
 * El FuenteDocumento del estado sin guardar, para armarDocumento (pendientes en el navegador, vista previa en el
 * servidor). Equipo y firmante salen de los catálogos; el contacto lo pasa quien llama (null alcanza para las
 * variables). Lo que está a medio escribir no rompe: fecha inválida → hoy, validez inválida → 0, cantidad
 * inválida → 1, precio inválido → sin precio.
 */
export function sourceFromEditor(
  estado: StatusEditor,
  catalogs: CatalogsEditor,
  contacto: { nombre: string; email: string } | null,
): SourceDocument {
  const equipo = catalogs.equipos.find((candidate) => candidate.id === estado.equipoId)
  const firmante = catalogs.firmantes.find((candidate) => candidate.id === estado.firmanteId)
  const validity = Number(estado.validezDias.trim())
  return {
    cotizacion: {
      numero: estado.numero,
      fecha: isDate(estado.fecha) ? estado.fecha : todayArgentina(),
      formato: estado.formato,
      asunto: estado.asunto,
      intro: estado.intro,
      validez_dias: Number.isInteger(validity) && validity > 0 ? validity : 0,
      mostrar_total: estado.mostrarTotal,
      datos: {
        ...estado.datos,
        proxima_actualizacion: nextUpdateInText(
          estado.proximaActualizacion,
          estado.datos.proxima_actualizacion,
        ),
      },
      bloques: estado.bloques.map(({ titulo: title, contenido: content, hidden }) => ({ titulo: title, contenido: content, hidden })),
    },
    items: estado.items.map((item, index) => ({
      orden: index + 1,
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: parsePrice(item.cantidad) ?? 1,
      precio_unitario: parsePrice(item.precio),
      unidad: item.unidad,
    })),
    cliente: { razon_social: estado.cliente?.razon_social ?? '', cuit: estado.cliente?.cuit ?? null },
    contacto,
    equipo: equipo ? { capacidad_tn: equipo.capacidad_tn, descripcion: equipo.descripcion } : null,
    firmante: firmante ? { nombre: firmante.nombre, cargo: firmante.cargo, telefono: firmante.telefono } : null,
    empresa: catalogs.empresa,
  }
}

/** Lo que falta para poder enviar o aprobar, calculado con el mismo armarDocumento que dibuja el PDF. */
export function pendingListEditor(estado: StatusEditor, catalogs: CatalogsEditor): PendingList {
  const document = buildDocument(sourceFromEditor(estado, catalogs, null))
  return {
    // Sin guardar todavía no hay número: se asigna al guardar, no es algo que el usuario tenga que completar.
    variables: document.faltantes.filter((nombre) => nombre !== 'numero' || estado.id !== null),
    desconocidas: document.desconocidas,
    itemsWithoutPrice: estado.items.filter((item) => parsePrice(item.precio) === null).length,
    withoutItems: estado.items.length === 0,
  }
}

export function canSend(p: PendingList): boolean {
  return p.variables.length === 0 && p.desconocidas.length === 0 && p.itemsWithoutPrice === 0 && !p.withoutItems
}
