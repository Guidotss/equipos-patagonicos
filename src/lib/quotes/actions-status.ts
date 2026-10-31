// src/lib/cotizaciones/acciones-estado.ts
// Qué acciones de estado ofrece el editor, qué franjas muestra y qué falta para enviar (decisiones 11 a 17).
// Puro: lo usan los componentes de cliente del editor.
import { formatDateCorta, ZONA_ARGENTINA } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import { VARIABLES, type NameVariable } from '@/lib/templates/variables'
import type { ContextoStatus } from './context-status'
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
export const LABEL_IN_CURSO: Record<ActionStatus, string> = {
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

export function isConfirmable(accion: ActionStatus): accion is ActionConfirmable {
  return (CONFIRMABLES as readonly string[]).includes(accion)
}

/** `?accion=aprobar` (desde el menú de una fila de la lista): abre esa confirmación al entrar. */
export function actionFromParam(value: string | string[] | undefined): ActionConfirmable | null {
  return typeof value === 'string' && (CONFIRMABLES as readonly string[]).includes(value)
    ? (value as ActionConfirmable)
    : null
}

/** Una transición del ⋯ de una fila de la lista: lleva a `/cotizaciones/{id}?accion={accion}`. */
export type TransicionList = { accion: ActionConfirmable; label: string }

/**
 * Las transiciones del ⋯ de una fila de la lista (relev-visual §1.6), solo en las armadas en la app (`origen` es el
 * de FilaCotizacion: null en las de la app). Llevan al editor con la confirmación abierta; si al entrar ya no se
 * puede (por ejemplo, un borrador que ya se envió no se elimina), el editor no la abre.
 */
export function transicionesOfList(row: { estado: string; origen: string | null }): TransicionList[] {
  if (row.origen !== null) return []
  switch (row.estado) {
    case 'borrador':
      return [{ accion: 'borrar', label: 'Eliminar borrador…' }]
    case 'enviada':
      return [
        { accion: 'aprobar', label: 'Aprobar…' },
        { accion: 'rechazar', label: 'Rechazar…' },
      ]
    case 'rechazada':
      return [{ accion: 'reabrir', label: 'Reabrir…' }]
    default:
      return []
  }
}

/** Solo se editan los borradores y las enviadas armadas en la app (guardar_cotizacion rechaza el resto). */
export function isEditable(estado: Pick<StatusEditor, 'origen' | 'estado'>): boolean {
  return estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
}

export type ButtonAction = { accion: ActionStatus; primaria: boolean }
export type LayoutActions = {
  /** Los botones del encabezado después de Guardar, de izquierda a derecha. */
  botones: ButtonAction[]
  /** Lo que va en el menú ⋯ (los envíos anteriores se agregan aparte). */
  menu: ActionStatus[]
}

/**
 * Los botones de cada estado (docs/diseno/referencias/03-editor-cotizacion.png y relev-visual §3.2). Las cargadas y
 * las directas no usan el editor (decisión 24). Eliminar solo aparece en un borrador que nunca se envió. Una nueva
 * muestra enviar y aprobar: guardan primero (decisión 12).
 */
export function layoutActions(
  estado: Pick<StatusEditor, 'id' | 'estado' | 'origen'>,
  contexto: Pick<ContextoStatus, 'envios'>,
): LayoutActions {
  if (estado.origen !== 'app') return { botones: [], menu: [] }
  if (!estado.id) {
    return { botones: [{ accion: 'enviar', primaria: true }, { accion: 'aprobar', primaria: false }], menu: [] }
  }
  switch (estado.estado) {
    case 'borrador':
      return {
        botones: [
          { accion: 'enviar', primaria: true },
          { accion: 'aprobar', primaria: false },
        ],
        menu: contexto.envios.length ? ['duplicar', 'rechazar'] : ['duplicar', 'rechazar', 'borrar'],
      }
    case 'enviada':
      return {
        botones: [
          { accion: 'rechazar', primaria: false },
          { accion: 'aprobar', primaria: true },
        ],
        menu: ['reenviar', 'duplicar'],
      }
    case 'aprobada':
      return {
        botones: [
          { accion: 'descargar', primaria: false },
          { accion: 'duplicar', primaria: true },
        ],
        menu: ['revertir'],
      }
    case 'rechazada':
      return {
        botones: [
          { accion: 'reabrir', primaria: true },
          { accion: 'duplicar', primaria: false },
        ],
        menu: [],
      }
  }
}

/**
 * Por qué un botón está deshabilitado (null: se puede). El detalle de lo que falta va en la franja amarilla. Una
 * nueva no se bloquea por no estar guardada: enviar y aprobar la guardan primero (decisión 12).
 */
export function reasonBlock(accion: ActionStatus, pendingList: PendingList): string | null {
  if (accion !== 'enviar' && accion !== 'reenviar' && accion !== 'aprobar') return null
  if (!canSend(pendingList)) return 'Completá lo que falta para enviarla o aprobarla'
  return null
}

/** true si la cotización se editó después del último envío (marcar_enviada deja updated_at = enviada_at). */
export function editedDespuesOfSend(version: string | null, lastSend: string | null): boolean {
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
  estado: Pick<StatusEditor, 'estado' | 'version'>,
  contexto: Pick<ContextoStatus, 'envios'>,
  hasChangesWithoutSave: boolean,
): boolean {
  if (estado.estado !== 'enviada') return false
  return hasChangesWithoutSave || editedDespuesOfSend(estado.version, contexto.envios[0]?.enviada_at ?? null)
}

/** El mensaje de la fecha de aprobación (null si sirve). La base vuelve a controlarlo. */
export function errorDateApproval(fecha: string, dateQuote: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Ingresá la fecha de aprobación'
  if (fecha < dateQuote) {
    return `No puede ser anterior a la fecha de la cotización (${formatDateCorta(dateQuote)})`
  }
  return null
}

/** Qué pasa al revertir: vuelve a enviada si se envió alguna vez (revertir_aprobacion). */
export function statusOnRevert(contexto: Pick<ContextoStatus, 'envios'>): 'enviada' | 'borrador' {
  return contexto.envios.length ? 'enviada' : 'borrador'
}

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "20/10/2026 14:35" (hora argentina): cada envío del historial. */
export function dateTimeOfMark(marca: string): string {
  return `${dateOfMark(marca)} ${HORA.format(new Date(marca))}`
}

export type Band =
  | { tipo: 'enviada'; texto: string; envioId: string | null }
  | { tipo: 'vencida'; texto: string }
  | { tipo: 'aprobada'; texto: string }
  | { tipo: 'rechazada'; texto: string }
  | { tipo: 'duplicada'; anterior: { id: string; numero: number } }

/** Las franjas de estado bajo el encabezado (relev-visual §3.9), en orden. */
export function bandsStatus(estado: Pick<StatusEditor, 'estado'>, contexto: ContextoStatus): Band[] {
  const bands: Band[] = []
  if (estado.estado === 'enviada') {
    if (contexto.vencida && contexto.venceEl) {
      bands.push({
        tipo: 'vencida',
        texto: `Venció el ${formatDateCorta(contexto.venceEl)}. Duplicala para renegociar o aprobala si el cliente la aceptó.`,
      })
    } else {
      const last = contexto.envios[0] ?? null
      bands.push({
        tipo: 'enviada',
        texto: `${last ? `Enviada el ${dateOfMark(last.enviada_at)}` : 'Enviada'}. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.`,
        envioId: last?.id ?? null,
      })
    }
  }
  if (estado.estado === 'aprobada') {
    const fecha = contexto.dateApproval ? ` el ${formatDateCorta(contexto.dateApproval)}` : ''
    bands.push({ tipo: 'aprobada', texto: `Aprobada${fecha}: es un presupuesto y no se modifica.` })
  }
  if (estado.estado === 'rechazada') {
    bands.push({ tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' })
  }
  if (contexto.anterior) bands.push({ tipo: 'duplicada', anterior: contexto.anterior })
  return bands
}

/**
 * Si ya hay equipo, se nombra el dato que le falta en su ficha; si no, se pide elegir uno.
 */
export function labelVariable(nombre: NameVariable, equipmentId: string): string {
  switch (nombre) {
    case 'capacidad':
      return equipmentId ? 'Capacidad del equipo' : 'Equipo'
    case 'equipo_descripcion':
      return equipmentId ? 'Descripción del equipo' : 'Equipo'
    case 'validez_dias':
      return 'Validez (días)'
    case 'proxima_actualizacion':
      return 'Próxima actualización'
    default:
      return VARIABLES[nombre]
  }
}

/** El id del precio de un ítem en la grilla (TarjetaItems, Task 9: `item-{clave}-precio`). */
export function idPriceItem(clave: string): string {
  return `item-${clave}-precio`
}

/** Un faltante de la franja amarilla: `destino` es el id del campo que recibe el foco (null: no hay un campo). */
export type Pending = { clave: string; texto: string; destination: string | null }

/**
 * Lo que la franja amarilla lista como "Para enviar falta completar" (decisión 17), sin repetir el mismo campo,
 * y aparte las variables mal escritas (se corrigen en los textos: no hay un campo al que llevar el foco).
 */
export function pendingListVisible(
  pendingList: PendingList,
  estado: Pick<StatusEditor, 'items' | 'equipoId'>,
): { missing: Pending[]; malEscritas: string[] } {
  const missing: Pending[] = []
  const vistos = new Set<string>()
  for (const variable of pendingList.variables) {
    const destination = idFieldVariable(variable)
    const texto = labelVariable(variable, estado.equipoId)
    // Sin equipo elegido, capacidad y descripción se resuelven con una sola selección.
    if (vistos.has(texto)) continue
    vistos.add(texto)
    missing.push({ clave: `variable-${variable}`, texto, destination })
  }
  if (pendingList.withoutItems) missing.push({ clave: 'sin-items', texto: 'al menos un ítem', destination: null })
  if (pendingList.itemsWithoutPrice > 0) {
    // El mismo criterio que pendientesEditor: un precio vacío o que no se puede leer cuenta como sin precio.
    const first = estado.items.find((item) => parsePrice(item.precio) === null)
    missing.push({
      clave: 'items-sin-precio',
      texto: pendingList.itemsWithoutPrice === 1 ? '1 ítem sin precio' : `${pendingList.itemsWithoutPrice} ítems sin precio`,
      destination: first ? idPriceItem(first.clave) : null,
    })
  }
  return { missing, malEscritas: pendingList.desconocidas.map((nombre) => `{{${nombre}}}`) }
}
