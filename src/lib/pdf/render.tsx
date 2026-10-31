import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentQuote } from '@/lib/quotes/document'
import { QuoteDaily } from './quote-daily'
import { QuoteMonthly } from './quote-monthly'
import { registerFonts } from './fonts'

export type OptionsRender = {
  /** Vista previa: las {{variables}} sin completar salen con fondo amarillo. */
  highlightVariables?: boolean
}

export async function renderizarQuote(doc: DocumentQuote, options: OptionsRender = {}): Promise<Buffer> {
  registerFonts()
  const Componente = doc.formato === 'mensual' ? QuoteMonthly : QuoteDaily
  return renderToBuffer(<Componente doc={doc} highlight={options.highlightVariables ?? false} />)
}
