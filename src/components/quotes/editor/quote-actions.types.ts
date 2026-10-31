import type { ActionConfirmable, ActionStatus } from '@/lib/quotes/actions-status'

export type Confirmation =
  | { tipo: ActionConfirmable }
  | { tipo: 'recargar' }
  | { tipo: 'finalizar'; anterior: { id: string; numero: number } }
  /** Duplicar con cambios sin guardar: guardarlos antes o copiar lo guardado. */
  | { tipo: 'duplicar' }

/** Qué hace el editor cuando llega la versión nueva del servidor: tomarla (después de una transición) o descartar lo local (Recargar). */
export type EsperaServidor = 'adoptar' | 'descartar'

/** Lo que devuelve el guardar del editor (VersionGuardada de la Task 8). */
export type QuoteGuardada = { id: string; version: string; numero: number }

export type ActionsStatus = {
  /** La acción que corre (la `accion` del editor: 'guardar' o una de estas). */
  inCurso: string | null
  /** Corre una acción (o una recarga): todos los botones de acción quedan deshabilitados (decisión 12). */
  busy: boolean
  /**
   * Corre una transición (también su guardado previo): el contenido del editor queda deshabilitado, así no se tipea
   * sobre algo que se está enviando, aprobando o rechazando.
   */
  inTransicion: boolean
  /** Corre el refresco de "Recargar": al terminar, el editor toma lo que haya en `inicial`. */
  recargando: boolean
  confirmation: Confirmation | null
  conflict: boolean
  iniciar: (accion: ActionStatus) => void
  cancelar: () => void
  aprobar: (fecha: string) => Promise<void>
  /** Confirma rechazar, reabrir, revertir o eliminar. */
  confirm: () => Promise<void>
  /** Duplica; con `guardarAntes`, guarda primero lo que hay en pantalla. */
  duplicar: (saveAntes: boolean) => Promise<void>
  finalizar: () => Promise<void>
  recargar: () => void
  confirmRecarga: () => void
}
