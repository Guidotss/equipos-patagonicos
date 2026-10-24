import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { armarDocumento } from '@/lib/cotizaciones/documento'
import { EJEMPLO_MENSUAL } from '@/lib/cotizaciones/ejemplos'
import { renderizarCotizacion } from './render'

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

describe('PDF mensual', () => {
  it('replica los datos de la cotización 112523', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(EJEMPLO_MENSUAL))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    const texto = await textoDelPdf(pdf)
    for (const esperado of [
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
      expect(texto).toContain(esperado)
    }
    expect(texto).not.toContain('{{')
  }, 20_000)
})
