import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { armarDocumento } from '@/lib/cotizaciones/documento'
import { EJEMPLO_JORNADA, EJEMPLO_MENSUAL } from '@/lib/cotizaciones/ejemplos'
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

describe('PDF por jornada', () => {
  it('replica los datos de la cotización 112711', async () => {
    const texto = await textoDelPdf(await renderizarCotizacion(armarDocumento(EJEMPLO_JORNADA)))
    for (const esperado of [
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
      expect(texto).toContain(esperado)
    }
    expect(texto.indexOf('Alcance:')).toBeLessThan(texto.indexOf('Precios Jornada:'))
    expect(texto.indexOf('Precios Jornada Adicional:')).toBeLessThan(texto.indexOf('Forma de pago'))
  }, 20_000)
})

describe('bloques ocultos', () => {
  it('un bloque oculto no sale en el PDF (por jornada y mensual)', async () => {
    const jornada = {
      ...EJEMPLO_JORNADA,
      cotizacion: {
        ...EJEMPLO_JORNADA.cotizacion,
        bloques: EJEMPLO_JORNADA.cotizacion.bloques.map((bloque) =>
          bloque.titulo === 'Alcance' ? { ...bloque, oculto: true } : bloque,
        ),
      },
    }
    const textoJornada = await textoDelPdf(await renderizarCotizacion(armarDocumento(jornada)))
    expect(textoJornada).toContain('Equipo ofrecido:')
    expect(textoJornada).toContain('Forma de pago: a 30 - 45 días F.F.')
    expect(textoJornada).not.toContain('Alcance')
    expect(textoJornada).not.toContain('Prestación mínima 8 hs')

    const mensual = {
      ...EJEMPLO_MENSUAL,
      cotizacion: {
        ...EJEMPLO_MENSUAL.cotizacion,
        bloques: EJEMPLO_MENSUAL.cotizacion.bloques.map((bloque) =>
          bloque.titulo === 'RENEGOCIACIÓN DE TARIFAS' ? { ...bloque, oculto: true } : bloque,
        ),
      },
    }
    const textoMensual = await textoDelPdf(await renderizarCotizacion(armarDocumento(mensual)))
    expect(textoMensual).toContain('CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS')
    expect(textoMensual).not.toContain('RENEGOCIACIÓN DE TARIFAS')
    expect(textoMensual).not.toContain('con base en junio 2026')
  }, 20_000)
})
