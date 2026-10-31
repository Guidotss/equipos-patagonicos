import { parsePrice } from '@/lib/format/amounts'
import { isDate, isMonth } from '@/lib/format/dates'
import { errorsByPath } from '@/lib/forms'
import { UNITS } from '@/lib/templates/content'
import { isUuid } from '@/lib/validation'
import { z } from 'zod'
import { schemaData, schemaItem } from '../data'
import { EDITOR_STATUSES, EDITOR_FORMATS, EDITOR_ORIGINS } from './constants'
import { nextUpdateInText } from './next-update'
import type { PayloadSave, StatusEditor } from './types'

const textFree = z.string().max(20_000)
const idOptional = z.union([z.literal(''), z.uuid()])

/**
 * La forma de StatusEditor, sin reglas de negocio (un precio mal escrito o la falta de cliente pasan). Sirve para
 * rechazar con 400 un cuerpo que no es un estado del editor (POST /cotizaciones/vista-previa) antes de usarlo; las
 * reglas para guardar están en payloadSave. Los ids son uuid o '' porque el servidor los relee de la base.
 */
export const schemaStatusEditor = z.object({
  id: z.uuid().nullable(),
  version: z.string().max(64).nullable(),
  numero: z.number().int().positive().nullable(),
  estado: z.enum(EDITOR_STATUSES),
  origen: z.enum(EDITOR_ORIGINS),
  cliente: z.object({ id: z.uuid(), razon_social: textFree, cuit: z.string().nullable() }).nullable(),
  contactoId: idOptional,
  templateId: idOptional,
  formato: z.enum(EDITOR_FORMATS),
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
        unidad: z.enum(UNITS),
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

function uuidOptional(message: string) {
  return z
    .string(message)
    .refine((value) => value === '' || isUuid(value), message)
    .transform((value) => value || null)
}

const clientChosen = z.unknown().transform((client, ctx) => {
  const id = client !== null && typeof client === 'object' ? (client as { id?: unknown }).id : undefined
  if (typeof id === 'string' && isUuid(id)) return id
  ctx.addIssue({ code: 'custom', message: 'Elegí el cliente' })
  return z.NEVER
})

const quantityWritten = z
  .string('Ingresá la cantidad')
  .transform((text, ctx) => {
    const quantity = parsePrice(text)
    if (quantity === null) {
      ctx.addIssue({ code: 'custom', message: text.trim() ? 'Cantidad inválida' : 'Ingresá la cantidad' })
      return z.NEVER
    }
    return quantity
  })
  .pipe(schemaItem.shape.cantidad)

const priceWritten = z
  .string('Precio inválido')
  .transform((text, ctx) => {
    if (text.trim() === '') return null
    const price = parsePrice(text)
    if (price === null) {
      ctx.addIssue({ code: 'custom', message: 'Precio inválido' })
      return z.NEVER
    }
    return price
  })
  .pipe(schemaItem.shape.precio_unitario)

// Las reglas de cada celda son las de schemaItem; las claves de error usan los nombres de la grilla
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

// Las claves son las de StatusEditor, así errorsByPath devuelve 'cliente', 'validezDias', 'items.2.precio'…
const schemaEditor = z.object({
  cliente: clientChosen,
  contactoId: uuidOptional('Contacto inválido'),
  templateId: uuidOptional('Plantilla inválida'),
  formato: z.enum(EDITOR_FORMATS, { error: 'Elegí el formato' }),
  equipoId: uuidOptional('Equipo inválido'),
  firmanteId: uuidOptional('Firmante inválido'),
  fecha: z.string(MESSAGE_DATE).refine(isDate, MESSAGE_DATE),
  validezDias: z
    .string(MESSAGE_VALIDITY)
    .trim()
    .regex(/^\d{1,3}$/, MESSAGE_VALIDITY)
    .transform(Number)
    .refine((days) => days >= 1 && days <= 365, MESSAGE_VALIDITY),
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
  state: StatusEditor,
): { ok: true; payload: PayloadSave } | { ok: false; errors: Record<string, string> } {
  const result = schemaEditor.safeParse(state)
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
          proxima_actualizacion: nextUpdateInText(valid.proximaActualizacion, valid.datos.proxima_actualizacion),
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
function fingerprint(state: StatusEditor): string {
  const result = payloadSave(state)
  if (result.ok) return `payload:${JSON.stringify(result.payload)}`
  return `estado:${JSON.stringify({
    ...state,
    items: state.items.map((item) => [item.seccion, item.descripcion, item.cantidad, item.precio, item.unidad]),
    bloques: state.bloques.map((block) => [block.titulo, block.contenido, block.hidden]),
  })}`
}

/**
 * true si guardar cambiaría algo. Compara lo que se mandaría a la base, no las claves ni cómo está escrito
 * ("39000000" y "39.000.000" son el mismo precio).
 */
export function hasChanges(saved: StatusEditor, current: StatusEditor): boolean {
  return fingerprint(saved) !== fingerprint(current)
}
