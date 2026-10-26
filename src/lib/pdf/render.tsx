import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { ResaltarVariables } from './comunes'
import { CotizacionJornada } from './cotizacion-jornada'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export type OpcionesRender = {
  /** Vista previa: las {{variables}} sin completar salen con fondo amarillo. */
  resaltarVariables?: boolean
}

export async function renderizarCotizacion(doc: DocumentoCotizacion, opciones: OpcionesRender = {}): Promise<Buffer> {
  registrarFuentes()
  const Componente = doc.formato === 'mensual' ? CotizacionMensual : CotizacionJornada
  return renderToBuffer(
    <ResaltarVariables.Provider value={opciones.resaltarVariables ?? false}>
      <Componente doc={doc} />
    </ResaltarVariables.Provider>,
  )
}
