import type { ScreenReaderInstructions } from '@dnd-kit/core'

/** Una línea desde 44rem de ancho propio; Precio y Total admiten "39.000.000,00" sin recortar. */
export const ITEM_COLUMNS = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_8rem_6rem_7rem]'
export const TEMPLATE_ITEM_COLUMNS = '@min-[44rem]:grid-cols-[1.75rem_minmax(0,1fr)_4rem_6rem]'

/** Cifras de la línea de un ítem desde 44rem: un punto más chicas que la descripción para que entren los montos. */
export const ITEM_NUMBER_CLASS = '@min-[44rem]:text-[13px]'

/** Los campos siempre muestran su contorno; el ancho del contenedor define la densidad de la grilla. */
export const ITEM_INPUT_CLASS = 'h-11 border-input bg-background shadow-none @min-[44rem]:h-10'

/** Espacio toma y suelta; Enter queda para abrir el menú del agarre. */
export const DRAG_KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

export const DRAG_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Para mover el ítem, presioná Espacio, movelo con las flechas y presioná Espacio para soltarlo; Escape cancela. ' +
    'Enter abre las opciones.',
}

/**
 * Avisa que el nombre de una sección (por la clave de su primer ítem) tiene un borrador sin aplicar, con la función que
 * lo aplica, o que dejó de tenerlo (null).
 */
export type OnChangeDraftSection = (key: string, apply: (() => void) | null) => void
