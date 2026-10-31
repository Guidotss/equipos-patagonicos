import { UNIDADES, readBlocks, type Block } from '@/lib/templates/content'
import { readData } from '../data'
import { EDITOR_STATUSES, EDITOR_FORMATS, EDITOR_ORIGINS } from './constants'
import { textPrice, textQuantity } from './numbers'
import { newKey } from './keys'
import type { BlockEditor, RowEditor, StatusEditor, TemplateEditor } from './types'

/** La base garantiza estos valores (CHECK): uno distinto es un error de programación. */
function unoOf<const T extends readonly string[]>(value: string, options: T, error: string): T[number] {
  if (!options.includes(value)) throw new Error(`${error}: ${value}`)
  return value as T[number]
}

export function createEditorBlocks(bloques: Block[]): BlockEditor[] {
  return bloques.map((block) => ({
    clave: newKey(),
    titulo: block.titulo,
    contenido: block.contenido,
    hidden: block.hidden,
  }))
}

/** Una cotización nueva: borrador de la app, con la plantilla aplicada si hay una. */
export function statusNew(args: { plantilla: TemplateEditor | null; firmanteId: string; today: string }): StatusEditor {
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
    estado: unoOf(row.estado, EDITOR_STATUSES, 'Estado desconocido'),
    origen: unoOf(row.origen, EDITOR_ORIGINS, 'Origen desconocido'),
    cliente: { id: row.cliente.id, razon_social: row.cliente.razon_social, cuit: row.cliente.cuit },
    contactoId: row.contacto_id ?? '',
    templateId: row.plantilla_id ?? '',
    formato: unoOf(row.formato, EDITOR_FORMATS, 'Formato desconocido'),
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
    bloques: createEditorBlocks(readBlocks(row.bloques)),
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
    bloques: createEditorBlocks(template.bloques),
  }
}
