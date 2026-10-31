// src/lib/quotes/actions-status.ts
// Qué acciones de estado ofrece el editor, qué franjas muestra y qué falta para enviar (decisiones 11 a 17).
// Puro: lo usan los componentes de cliente del editor.
import { formatShortDate, ARGENTINA_TIME_ZONE } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import { VARIABLES, type NameVariable } from '@/lib/templates/variables'
import type { StatusContext } from './context-status'
import { MESSAGE_CONFLICT } from './editor/constants'
import { canSend } from './editor/document'
import type { StatusEditor, PendingList } from './editor/types'
import { idFieldVariable } from './editor-screen'
import { dateOfMark } from './preview'

/** El error de private.exigir_version (MENSAJE_CONFLICTO, editor.ts): la cotización cambió desde que se abrió. */
export function isConflict(message: string | null | undefined): boolean {
  return message === MESSAGE_CONFLICT
}

export type ActionStatus =
  | 'enviar'
  | 'reenviar'
  | 'aprobar'
  | 'rechazar'
  | 'reabrir'
  | 'revertir'
  | 'borrar'
  | 'duplicar'
  | 'descargar'

export const LABEL_ACTION: Record<ActionStatus, string> = {
  enviar: 'Descargar y marcar enviada',
  reenviar: 'Descargar y marcar enviada de nuevo',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  reabrir: 'Reabrir',
  revertir: 'Revertir aprobación',
  borrar: 'Eliminar borrador',
  duplicar: 'Duplicar',
  descargar: 'Descargar PDF',
}

/** El texto del botón mientras la acción corre. */
export const ACTION_PROGRESS_LABEL: Record<ActionStatus, string> = {
  enviar: 'Generando…',
  reenviar: 'Generando…',
  aprobar: 'Aprobando…',
  rechazar: 'Rechazando…',
  reabrir: 'Reabriendo…',
  revertir: 'Revirtiendo…',
  borrar: 'Eliminando…',
  duplicar: 'Duplicando…',
  descargar: 'Descargar PDF',
}

/** Las que piden confirmación en el lugar (decisión 15). Duplicar y enviar no. */
export const CONFIRMABLES = ['aprobar', 'rechazar', 'reabrir', 'revertir', 'borrar'] as const
export type ActionConfirmable = (typeof CONFIRMABLES)[number]

export function isConfirmable(action: ActionStatus): action is ActionConfirmable {
  return (CONFIRMABLES as readonly string[]).includes(action)
}

/** `?accion=aprobar` (desde el menú de una fila de la lista): abre esa confirmación al entrar. */
export function actionFromParam(value: string | string[] | undefined): ActionConfirmable | null {
  return typeof value === 'string' && (CONFIRMABLES as readonly string[]).includes(value)
    ? (value as ActionConfirmable)
    : null
}

/** Una transición del ⋯ de una fila de la lista: lleva a `/cotizaciones/{id}?accion={accion}`. */
export type ListTransition = { action: ActionConfirmable; label: string }

/**
 * Las transiciones del ⋯ de una fila de la lista (relev-visual §1.6), solo en las armadas en la app (`origen` es el
 * de FilaCotizacion: null en las de la app). Llevan al editor con la confirmación abierta; si al entrar ya no se
 * puede (por ejemplo, un borrador que ya se envió no se elimina), el editor no la abre.
 */
export function listTransitions(row: { estado: string; origen: string | null }): ListTransition[] {
  if (row.origen !== null) return []
  switch (row.estado) {
    case 'borrador':
      return [{ action: 'borrar', label: 'Eliminar borrador…' }]
    case 'enviada':
      return [
        { action: 'aprobar', label: 'Aprobar…' },
        { action: 'rechazar', label: 'Rechazar…' },
      ]
    case 'rechazada':
      return [{ action: 'reabrir', label: 'Reabrir…' }]
    default:
      return []
  }
}

/** Solo se editan los borradores y las enviadas armadas en la app (guardar_cotizacion rechaza el resto). */
export function isEditable(state: Pick<StatusEditor, 'origen' | 'estado'>): boolean {
  return state.origen === 'app' && (state.estado === 'borrador' || state.estado === 'enviada')
}

export type ButtonAction = { action: ActionStatus; primary: boolean }
export type LayoutActions = {
  /** Los botones del encabezado después de Guardar, de izquierda a derecha. */
  buttons: ButtonAction[]
  /** Lo que va en el menú ⋯ (los envíos anteriores se agregan aparte). */
  menu: ActionStatus[]
}

/**
 * Los botones de cada estado (docs/diseno/referencias/03-editor-cotizacion.png y relev-visual §3.2). Las cargadas y
 * las directas no usan el editor (decisión 24). Eliminar solo aparece en un borrador que nunca se envió. Una nueva
 * muestra enviar y aprobar: guardan primero (decisión 12).
 */
export function layoutActions(
  state: Pick<StatusEditor, 'id' | 'estado' | 'origen'>,
  context: Pick<StatusContext, 'envios'>,
): LayoutActions {
  if (state.origen !== 'app') return { buttons: [], menu: [] }
  if (!state.id) {
    return { buttons: [{ action: 'enviar', primary: true }, { action: 'aprobar', primary: false }], menu: [] }
  }
  switch (state.estado) {
    case 'borrador':
      return {
        buttons: [
          { action: 'enviar', primary: true },
          { action: 'aprobar', primary: false },
        ],
        menu: context.envios.length ? ['duplicar', 'rechazar'] : ['duplicar', 'rechazar', 'borrar'],
      }
    case 'enviada':
      return {
        buttons: [
          { action: 'rechazar', primary: false },
          { action: 'aprobar', primary: true },
        ],
        menu: ['reenviar', 'duplicar'],
      }
    case 'aprobada':
      return {
        buttons: [
          { action: 'descargar', primary: false },
          { action: 'duplicar', primary: true },
        ],
        menu: ['revertir'],
      }
    case 'rechazada':
      return {
        buttons: [
          { action: 'reabrir', primary: true },
          { action: 'duplicar', primary: false },
        ],
        menu: [],
      }
  }
}

/**
 * Por qué un botón está deshabilitado (null: se puede). El detalle de lo que falta va en la franja amarilla. Una
 * nueva no se bloquea por no estar guardada: enviar y aprobar la guardan primero (decisión 12).
 */
export function reasonBlock(action: ActionStatus, pendingList: PendingList): string | null {
  if (action !== 'enviar' && action !== 'reenviar' && action !== 'aprobar') return null
  if (!canSend(pendingList)) return 'Completá lo que falta para enviarla o aprobarla'
  return null
}

/** true si la cotización se editó después del último envío (marcar_enviada deja updated_at = enviada_at). */
export function editedAfterSend(version: string | null, lastSend: string | null): boolean {
  if (!version || !lastSend) return false
  return new Date(version).getTime() > new Date(lastSend).getTime()
}

/**
 * Aprobar una enviada con cambios que el cliente no recibió congela una versión que no vio (decisión 14).
 * Limitación aceptada: después de revertir la aprobación de una enviada, updated_at queda posterior al último envío
 * aunque el contenido no haya cambiado, y el aviso aparece igual. Es solo un aviso; no hay en la base una marca del
 * último guardado de contenido con la que distinguirlo.
 */
export function approvesVersionNoSent(
  state: Pick<StatusEditor, 'estado' | 'version'>,
  context: Pick<StatusContext, 'envios'>,
  hasChangesWithoutSave: boolean,
): boolean {
  if (state.estado !== 'enviada') return false
  return hasChangesWithoutSave || editedAfterSend(state.version, context.envios[0]?.enviada_at ?? null)
}

/** El mensaje de la fecha de aprobación (null si sirve). La base vuelve a controlarlo. */
export function errorDateApproval(date: string, dateQuote: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Ingresá la fecha de aprobación'
  if (date < dateQuote) {
    return `No puede ser anterior a la fecha de la cotización (${formatShortDate(dateQuote)})`
  }
  return null
}

/** Qué pasa al revertir: vuelve a enviada si se envió alguna vez (revertir_aprobacion). */
export function statusOnRevert(context: Pick<StatusContext, 'envios'>): 'enviada' | 'borrador' {
  return context.envios.length ? 'enviada' : 'borrador'
}

const TIME_FORMAT = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "20/10/2026 14:35" (hora argentina): cada envío del historial. */
export function formatTimestamp(timestamp: string): string {
  return `${dateOfMark(timestamp)} ${TIME_FORMAT.format(new Date(timestamp))}`
}

export type Band =
  | { type: 'enviada'; text: string; envioId: string | null }
  | { type: 'vencida'; text: string }
  | { type: 'aprobada'; text: string }
  | { type: 'rechazada'; text: string }
  | { type: 'duplicada'; anterior: { id: string; numero: number } }

/** Las franjas de estado bajo el encabezado (relev-visual §3.9), en orden. */
export function bandsStatus(state: Pick<StatusEditor, 'estado'>, context: StatusContext): Band[] {
  const bands: Band[] = []
  if (state.estado === 'enviada') {
    if (context.vencida && context.venceEl) {
      bands.push({
        type: 'vencida',
        text: `Venció el ${formatShortDate(context.venceEl)}. Duplicala para renegociar o aprobala si el cliente la aceptó.`,
      })
    } else {
      const last = context.envios[0] ?? null
      bands.push({
        type: 'enviada',
        text: `${last ? `Enviada el ${dateOfMark(last.enviada_at)}` : 'Enviada'}. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.`,
        envioId: last?.id ?? null,
      })
    }
  }
  if (state.estado === 'aprobada') {
    const date = context.dateApproval ? ` el ${formatShortDate(context.dateApproval)}` : ''
    bands.push({ type: 'aprobada', text: `Aprobada${date}: es un presupuesto y no se modifica.` })
  }
  if (state.estado === 'rechazada') {
    bands.push({ type: 'rechazada', text: 'Rechazada. Para volver a editarla, reabrila.' })
  }
  if (context.anterior) bands.push({ type: 'duplicada', anterior: context.anterior })
  return bands
}

/**
 * Si ya hay equipo, se nombra el dato que le falta en su ficha; si no, se pide elegir uno.
 */
export function labelVariable(name: NameVariable, equipmentId: string): string {
  switch (name) {
    case 'capacidad':
      return equipmentId ? 'Capacidad del equipo' : 'Equipo'
    case 'equipo_descripcion':
      return equipmentId ? 'Descripción del equipo' : 'Equipo'
    case 'validez_dias':
      return 'Validez (días)'
    case 'proxima_actualizacion':
      return 'Próxima actualización'
    default:
      return VARIABLES[name]
  }
}

/** El id del precio de un ítem en la grilla (CardItems, Task 9: `item-{clave}-precio`). */
export function idPriceItem(key: string): string {
  return `item-${key}-precio`
}

/** Un faltante de la franja amarilla: `destino` es el id del campo que recibe el foco (null: no hay un campo). */
export type Pending = { key: string; text: string; destination: string | null }

/**
 * Lo que la franja amarilla lista como "Para enviar falta completar" (decisión 17), sin repetir el mismo campo,
 * y aparte las variables mal escritas (se corrigen en los textos: no hay un campo al que llevar el foco).
 */
export function pendingListVisible(
  pendingList: PendingList,
  state: Pick<StatusEditor, 'items' | 'equipoId'>,
): { missing: Pending[]; unknownVariables: string[] } {
  const missing: Pending[] = []
  const seen = new Set<string>()
  for (const variable of pendingList.variables) {
    const destination = idFieldVariable(variable)
    const text = labelVariable(variable, state.equipoId)
    // Sin equipo elegido, capacidad y descripción se resuelven con una sola selección.
    if (seen.has(text)) continue
    seen.add(text)
    missing.push({ key: `variable-${variable}`, text, destination })
  }
  if (pendingList.withoutItems) missing.push({ key: 'sin-items', text: 'al menos un ítem', destination: null })
  if (pendingList.itemsWithoutPrice > 0) {
    // El mismo criterio que pendientesEditor: un precio vacío o que no se puede leer cuenta como sin precio.
    const first = state.items.find((item) => parsePrice(item.precio) === null)
    missing.push({
      key: 'items-sin-precio',
      text: pendingList.itemsWithoutPrice === 1 ? '1 ítem sin precio' : `${pendingList.itemsWithoutPrice} ítems sin precio`,
      destination: first ? idPriceItem(first.clave) : null,
    })
  }
  return { missing, unknownVariables: pendingList.desconocidas.map((name) => `{{${name}}}`) }
}
