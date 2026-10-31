/** Desde este ancho la vista previa es una columna fija (docs/diseno/referencias/03-editor-cotizacion.png). */
export const PREVIEW_DESKTOP_QUERY = '(min-width: 90rem)'

export function isPreviewDesktop(): boolean {
  return window.matchMedia(PREVIEW_DESKTOP_QUERY).matches
}

export function subscribePreviewDesktop(notify: () => void) {
  const query = window.matchMedia(PREVIEW_DESKTOP_QUERY)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
