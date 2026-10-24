import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { CotizacionJornada } from './cotizacion-jornada'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export async function renderizarCotizacion(doc: DocumentoCotizacion): Promise<Buffer> {
  registrarFuentes()
  const Componente = doc.formato === 'mensual' ? CotizacionMensual : CotizacionJornada
  return renderToBuffer(<Componente doc={doc} />)
}
