import { createElement } from 'react'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { getDocumentProxy } from 'unpdf'
import { FAMILIA, prepareFonts } from './fonts'

export const FONT_COPY = 'BONIFICADA oficina inflación affinity afflict fi fl ffi ffl Ítem ñandú acción pingüino'

export async function rawPdfText(pdf: Buffer): Promise<string> {
  const proxy = await getDocumentProxy(new Uint8Array(pdf))
  const pages: string[] = []
  for (let index = 1; index <= proxy.numPages; index++) {
    const content = await (await proxy.getPage(index)).getTextContent({ disableNormalization: true })
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
  }
  return pages.join(' ').replace(/\s+/g, ' ')
}

export async function renderFontStyles(text: string): Promise<string> {
  await prepareFonts()
  const blocks = [400, 700].flatMap((fontWeight) => (['normal', 'italic'] as const).map((fontStyle) =>
    createElement(Text, { key: `${fontWeight}-${fontStyle}`, style: { fontFamily: FAMILIA, fontWeight, fontStyle, fontSize: 12 } }, text),
  ))
  const pdf = await renderToBuffer(createElement(Document, {}, createElement(Page, {}, ...blocks)))
  return rawPdfText(pdf)
}
