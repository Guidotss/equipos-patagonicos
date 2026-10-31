import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/lib/quotes/document'
import { EXAMPLE_DAILY, EXAMPLE_MONTHLY } from '@/lib/quotes/examples'
import { renderQuote } from './render'

async function textOfPdf(pdf: Buffer): Promise<string> {
  const document = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(document, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

describe('PDF mensual', () => {
  it('replica los datos de la cotización 112523', async () => {
    const pdf = await renderQuote(buildDocument(EXAMPLE_MONTHLY))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    const texto = await textOfPdf(pdf)
    for (const expected of [
      'Neuquén, 15 de julio de 2026.',
      'Milicic S.A.',
      'Atte. Yanina Colman',
      'yanina.colman@milicic.com.ar',
      'Cotización N° 112523',
      'Alquiler mensual Grúa 70 TN',
      '39.000.000,00',
      'ARS',
      'JORNADA',
      'CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR',
      'Sargento Vidal Ruta Nacional 151 km 41',
      'Documentación:',
      'con base en junio 2026',
      'Julio Rojas',
      'Contrataciones / Logística',
      'T. Planas 5168 - Neuquén - Argentina',
      'www.equipospatagonicos.com.ar',
    ]) {
      expect(texto).toContain(expected)
    }
    expect(texto).not.toContain('{{')
  }, 20_000)
})

describe('PDF por jornada', () => {
  it('replica los datos de la cotización 112711', async () => {
    const texto = await textOfPdf(await renderQuote(buildDocument(EXAMPLE_DAILY)))
    for (const expected of [
      'Neuquén, 22 de octubre de 2026.',
      'Señores',
      'VERTICE SERVICIOS INTEGRALES S.R.L.',
      'Cuit: 30-71952967-0',
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
      'Equipo ofrecido:',
      'Alcance:',
      'Precios Jornada:',
      '$ 1.950.000.- más IVA',
      'Precios Jornada Adicional:',
      '$ 2.530.000.- más IVA',
      'Forma de pago: a 30 - 45 días F.F.',
      'Thomas Cravero',
    ]) {
      expect(texto).toContain(expected)
    }
    expect(texto.indexOf('Alcance:')).toBeLessThan(texto.indexOf('Precios Jornada:'))
    expect(texto.indexOf('Precios Jornada Adicional:')).toBeLessThan(texto.indexOf('Forma de pago'))
  }, 20_000)
})

describe('bloques ocultos', () => {
  it('un bloque oculto no sale en el PDF (por jornada y mensual)', async () => {
    const daily = {
      ...EXAMPLE_DAILY,
      cotizacion: {
        ...EXAMPLE_DAILY.cotizacion,
        bloques: EXAMPLE_DAILY.cotizacion.bloques.map((block) =>
          block.titulo === 'Alcance' ? { ...block, hidden: true } : block,
        ),
      },
    }
    const textDaily = await textOfPdf(await renderQuote(buildDocument(daily)))
    expect(textDaily).toContain('Equipo ofrecido:')
    expect(textDaily).toContain('Forma de pago: a 30 - 45 días F.F.')
    expect(textDaily).not.toContain('Alcance')
    expect(textDaily).not.toContain('Prestación mínima 8 hs')

    const monthly = {
      ...EXAMPLE_MONTHLY,
      cotizacion: {
        ...EXAMPLE_MONTHLY.cotizacion,
        bloques: EXAMPLE_MONTHLY.cotizacion.bloques.map((block) =>
          block.titulo === 'RENEGOCIACIÓN DE TARIFAS' ? { ...block, hidden: true } : block,
        ),
      },
    }
    const textMonthly = await textOfPdf(await renderQuote(buildDocument(monthly)))
    expect(textMonthly).toContain('CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS')
    expect(textMonthly).not.toContain('RENEGOCIACIÓN DE TARIFAS')
    expect(textMonthly).not.toContain('con base en junio 2026')
  }, 20_000)
})

describe('cotización sin guardar', () => {
  it('sin número, el PDF muestra {{numero}} en su lugar', async () => {
    const monthly = { ...EXAMPLE_MONTHLY, cotizacion: { ...EXAMPLE_MONTHLY.cotizacion, numero: null } }
    expect(await textOfPdf(await renderQuote(buildDocument(monthly)))).toContain('Cotización N° {{numero}}')

    const daily = { ...EXAMPLE_DAILY, cotizacion: { ...EXAMPLE_DAILY.cotizacion, numero: null } }
    expect(await textOfPdf(await renderQuote(buildDocument(daily)))).toContain('Cotización N° {{numero}}')
  }, 20_000)
})
