/** Desde este ancho la vista previa es una columna fija (docs/diseno/referencias/03-editor-cotizacion.png). */
export const PREVIEW_DESKTOP_QUERY = '(min-width: 90rem)'

export function isPreviewDesktop(): boolean {
  return window.matchMedia(PREVIEW_DESKTOP_QUERY).matches
}

export function subscribePreviewDesktop(avisar: () => void) {
  const consulta = window.matchMedia(PREVIEW_DESKTOP_QUERY)
  consulta.addEventListener('change', avisar)
  return () => consulta.removeEventListener('change', avisar)
}
