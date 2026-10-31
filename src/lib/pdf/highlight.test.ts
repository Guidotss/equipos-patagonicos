// src/lib/pdf/highlight.test.ts
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/lib/quotes/document'
import { EXAMPLE_DAILY, EXAMPLE_MONTHLY } from '@/lib/quotes/examples'
import { AMARILLO_VARIABLE } from './styles'
import { renderQuote } from './render'

async function textOfPdf(pdf: Buffer): Promise<string> {
  const document = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(document, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** Los colores de relleno que usa el PDF ('#rrggbb'), leídos de las operaciones de dibujo de cada página. */
async function coloresOfRelleno(pdf: Buffer): Promise<Set<string>> {
  const { OPS } = await getResolvedPDFJS()
  const document = await getDocumentProxy(new Uint8Array(pdf))
  const colores = new Set<string>()
  for (let numero = 1; numero <= document.numPages; numero++) {
    const { fnArray, argsArray } = await (await document.getPage(numero)).getOperatorList()
    fnArray.forEach((operacion, index) => {
      if (operacion === OPS.setFillRGBColor) colores.add(String(argsArray[index][0]).toLowerCase())
    })
  }
  return colores
}

const AMARILLO = AMARILLO_VARIABLE.toLowerCase()

/** La 112523 sin los datos de la cotización: quedan {{horario}}, {{ubicacion}}, {{plazo_entrega}} y {{forma_pago}}. */
const WITHOUT_DATA = { ...EXAMPLE_MONTHLY, cotizacion: { ...EXAMPLE_MONTHLY.cotizacion, datos: {} } }

describe('resaltar variables (vista previa)', () => {
  it('con resaltarVariables pinta de amarillo las variables sin completar y las deja en el texto', async () => {
    const pdf = await renderQuote(buildDocument(WITHOUT_DATA), { highlightVariables: true })
    expect(await textOfPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresOfRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)

  it('sin la opción (el PDF que se envía o se aprueba) no pinta nada', async () => {
    const pdf = await renderQuote(buildDocument(WITHOUT_DATA))
    expect(await textOfPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresOfRelleno(pdf)).not.toContain(AMARILLO)
  }, 20_000)

  it('un documento completo no tiene nada que resaltar y el texto sale corrido', async () => {
    const pdf = await renderQuote(buildDocument(EXAMPLE_DAILY), { highlightVariables: true })
    expect(await coloresOfRelleno(pdf)).not.toContain(AMARILLO)
    expect(await textOfPdf(pdf)).toContain(
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
    )
  }, 20_000)

  it('sin número (una cotización sin guardar) muestra {{numero}} resaltado', async () => {
    const withoutNumber = { ...EXAMPLE_MONTHLY, cotizacion: { ...EXAMPLE_MONTHLY.cotizacion, numero: null } }
    const pdf = await renderQuote(buildDocument(withoutNumber), { highlightVariables: true })
    expect(await textOfPdf(pdf)).toContain('Cotización N° {{numero}}')
    expect(await coloresOfRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)
})
