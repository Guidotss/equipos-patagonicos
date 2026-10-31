import { isMonth, monthInLetters } from '@/lib/format/dates'
import { newKey } from './keys'
import { applyTemplate, createEditorBlocks } from './state'
import type { ActionEditor, ItemEditor, StatusEditor } from './types'

function insert<T>(list: T[], position: number, element: T): T[] {
  return [...list.slice(0, position), element, ...list.slice(position)]
}

/** Saca el elemento de `desde` y lo pone en `hasta` (como arrayMove de dnd-kit). */
function move<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list]
  const [element] = copy.splice(from, 1)
  copy.splice(to, 0, element)
  return copy
}

/** Fila vacía: copia sección y unidad de la fila de referencia; sin referencia, la unidad típica del formato. */
function createItem(state: StatusEditor, reference: ItemEditor | undefined, section?: string): ItemEditor {
  return {
    clave: newKey(),
    seccion: section ?? reference?.seccion ?? '',
    descripcion: '',
    cantidad: '1',
    precio: '',
    unidad: reference?.unidad ?? (state.formato === 'jornada' ? 'JORNADA' : 'UNIDAD'),
  }
}

function moveItem(items: ItemEditor[], from: number, to: number): ItemEditor[] {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length
  if (from === to || !valid(from) || !valid(to)) return items
  const list = move(items, from, to)
  const previous = list[to - 1]
  const next = list[to + 1]
  const moved = list[to]
  // Las secciones son rachas de filas consecutivas. Si la fila cae en el medio de otro grupo, se suma a ese grupo:
  // si conservara la suya, partiría el grupo en dos. En el borde entre dos grupos conserva su sección.
  if (previous && next && previous.seccion === next.seccion && moved.seccion !== previous.seccion) {
    list[to] = { ...moved, seccion: previous.seccion }
  }
  return list
}

/** Renombra la racha de filas consecutivas con la misma sección que la fila `clave` (no otras rachas iguales). */
function renameSection(items: ItemEditor[], key: string, section: string): ItemEditor[] {
  const index = items.findIndex((item) => item.clave === key)
  if (index < 0) return items
  const current = items[index].seccion
  let home = index
  while (home > 0 && items[home - 1].seccion === current) home--
  let end = index
  while (end < items.length - 1 && items[end + 1].seccion === current) end++
  return items.map((item, i) => (i >= home && i <= end ? { ...item, seccion: section } : item))
}

/**
 * Todas las transiciones del editor. Pura salvo las claves nuevas (crypto.randomUUID). Si la acción no cambia nada
 * (mover fuera de rango, una clave que ya no existe), devuelve el mismo estado.
 */
export function reduceEditor(state: StatusEditor, action: ActionEditor): StatusEditor {
  switch (action.tipo) {
    case 'campo':
      if (action.campo === 'proximaActualizacion') {
        // Un solo control llena la fecha y el texto del PDF (decisión 7). Vaciarlo borra también el texto: el PDF
        // vuelve al valor de la empresa, igual antes y después de recargar. Mientras no se toque, el texto que trajo
        // la fila se conserva.
        return {
          ...state,
          proximaActualizacion: action.value,
          datos: { ...state.datos, proxima_actualizacion: isMonth(action.value) ? monthInLetters(action.value) : '' },
        }
      }
      return { ...state, [action.campo]: action.value }
    case 'dato':
      return { ...state, datos: { ...state.datos, [action.campo]: action.value } }
    case 'mostrarTotal':
      return { ...state, mostrarTotal: action.value }
    case 'cliente':
      return { ...state, cliente: action.cliente, contactoId: action.contactoId }
    case 'plantilla':
      return applyTemplate(state, action.plantilla)
    case 'agregarItem': {
      const index = action.despuesOf ? state.items.findIndex((item) => item.clave === action.despuesOf) : -1
      const reference = index >= 0 ? state.items[index] : state.items.at(-1)
      const next = createItem(state, reference, action.seccion)
      return { ...state, items: insert(state.items, index >= 0 ? index + 1 : state.items.length, next) }
    }
    case 'item':
      if (!state.items.some((item) => item.clave === action.clave)) return state
      return {
        ...state,
        items: state.items.map((item) =>
          item.clave === action.clave ? { ...item, ...action.changes, clave: item.clave } : item,
        ),
      }
    case 'moverItem': {
      const items = moveItem(state.items, action.desde, action.hasta)
      return items === state.items ? state : { ...state, items }
    }
    case 'quitarItem':
      if (!state.items.some((item) => item.clave === action.clave)) return state
      return { ...state, items: state.items.filter((item) => item.clave !== action.clave) }
    case 'duplicarItem': {
      const index = state.items.findIndex((item) => item.clave === action.clave)
      if (index < 0) return state
      const copy = { ...state.items[index], clave: newKey() }
      return { ...state, items: insert(state.items, index + 1, copy) }
    }
    case 'renombrarSeccion': {
      const items = renameSection(state.items, action.clave, action.seccion)
      return items === state.items ? state : { ...state, items }
    }
    case 'agregarSeccion': {
      const next = createItem(state, state.items.at(-1), action.nombre.trim() || 'Nueva sección')
      return { ...state, items: [...state.items, next] }
    }
    case 'bloque':
      if (!state.bloques.some((block) => block.clave === action.clave)) return state
      return {
        ...state,
        bloques: state.bloques.map((block) =>
          block.clave === action.clave ? { ...block, ...action.changes, clave: block.clave } : block,
        ),
      }
    case 'moverBloque': {
      const index = state.bloques.findIndex((block) => block.clave === action.clave)
      const destination = index + action.direccion
      if (index < 0 || destination < 0 || destination >= state.bloques.length) return state
      return { ...state, bloques: move(state.bloques, index, destination) }
    }
    case 'restaurarBloques':
      return { ...state, bloques: createEditorBlocks(action.bloques) }
    case 'guardado':
      return { ...state, id: action.id, version: action.version, numero: action.numero }
    case 'reemplazar':
      return action.estado
  }
}
