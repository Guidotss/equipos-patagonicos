import type { ActionConfirmable, ActionStatus } from '@/lib/quotes/actions-status'

export type Confirmation =
  | { type: ActionConfirmable }
  | { type: 'recargar' }
  | { type: 'finalizar'; previous: { id: string; numero: number } }
  /** Duplicar con cambios sin guardar: guardarlos antes o copiar lo guardado. */
  | { type: 'duplicar' }

/** Qué hace el editor cuando llega la versión nueva del servidor: tomarla (después de una transición) o descartar lo local (Recargar). */
export type ServerUpdateMode = 'adoptar' | 'descartar'

/** Lo que devuelve el guardar del editor (SavedQuote de la Task 8). */
export type SavedQuote = { id: string; version: string; numero: number }

export type ActionsStatus = {
  /** La acción que corre (la `action` del editor: 'guardar' o una de estas). */
  currentAction: string | null
  /** Corre una acción (o una recarga): todos los botones de acción quedan deshabilitados (decisión 12). */
  busy: boolean
  /**
   * Corre una transición (también su guardado previo): el contenido del editor queda deshabilitado, así no se tipea
   * sobre algo que se está enviando, aprobando o rechazando.
   */
  transitioning: boolean
  /** Corre el refresco de "Recargar": al terminar, el editor toma lo que haya en `initial`. */
  reloading: boolean
  confirmation: Confirmation | null
  conflict: boolean
  start: (action: ActionStatus) => void
  cancel: () => void
  approve: (date: string) => Promise<void>
  /** Confirma rechazar, reabrir, revertir o eliminar. */
  confirm: () => Promise<void>
  /** Duplica; con `saveFirst`, guarda primero lo que hay en pantalla. */
  duplicate: (saveFirst: boolean) => Promise<void>
  finish: () => Promise<void>
  reload: () => void
  confirmReload: () => void
}
