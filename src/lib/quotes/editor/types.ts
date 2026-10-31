import type { Block, Format, ItemTemplate, Unit } from '@/lib/templates/content'
import type { NameVariable } from '@/lib/templates/variables'
import type { DataQuote, FieldData } from '../data'
import type { SourceDocument } from '../document'

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
