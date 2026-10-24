import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export async function renderizarCotizacion(doc: DocumentoCotizacion): Promise<Buffer> {
  registrarFuentes()
  return renderToBuffer(<CotizacionMensual doc={doc} />)
}
