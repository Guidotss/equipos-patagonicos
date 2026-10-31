import { isMonth, monthInLetters } from '@/lib/format/dates'
import { newKey } from './keys'
import { applyTemplate, createEditorBlocks } from './state'
import type { ActionEditor, ItemEditor, StatusEditor } from './types'

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
      return { ...estado, bloques: createEditorBlocks(accion.bloques) }
    case 'guardado':
      return { ...estado, id: accion.id, version: accion.version, numero: accion.numero }
    case 'reemplazar':
      return accion.estado
  }
}
