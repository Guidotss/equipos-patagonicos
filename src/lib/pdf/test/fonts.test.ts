import { expect, it } from 'vitest'
import { buildDocument, type SourceDocument } from '@/lib/quotes/document'
import { EXAMPLE_DAILY } from '@/lib/quotes/examples'
import { renderQuote } from '.././render'
import {
  FONT_COPY,
  rawPdfText,
  renderFontStyles,
} from '.././font-test-fixtures'

function shortSource(format: 'mensual' | 'jornada'): SourceDocument {
  return {
    ...EXAMPLE_DAILY,
    firmante: null,
    cotizacion: {
      ...EXAMPLE_DAILY.cotizacion,
      formato: format,
      asunto: 'Servicio',
      intro: '',
      bloques: [],
      mostrar_total: true,
    },
    items: [
      {
        orden: 1,
        descripcion: 'Traslado bonificado',
        seccion: 'Servicios',
        cantidad: 2,
        precio_unitario: 0,
        is_complimentary: true,
        unidad: 'VIAJE',
      },
      {
        orden: 2,
        descripcion:
          'Oficina, flota y eficiencia. Ítem, ñandú, acción y pingüino.',
        seccion: 'Servicios',
        cantidad: 2,
        precio_unitario: 100,
        unidad: 'VIAJE',
      },
    ],
  }
}

async function textFor(format: 'mensual' | 'jornada'): Promise<string> {
  const pdf = await renderQuote(buildDocument(shortSource(format)))
  return rawPdfText(pdf)
}

it('conserva Unicode al generar una mensual breve antes de una jornada y en paralelo', async () => {
  await renderFontStyles('Ítem')
  const styles = await renderFontStyles(FONT_COPY)
  expect(styles.split(FONT_COPY)).toHaveLength(5)
  expect(styles).not.toMatch(/[\u001c\uFB00-\uFB06]/u)
  // «Ítem» compone el glifo base de la I en negrita aunque la mensual no tenga ninguna I sin acento.
  for (const format of ['mensual', 'jornada'] as const) {
    const text = await textFor(format)
    expect(text).toContain('BONIFICADA')
    expect(text).toContain(
      'Oficina, flota y eficiencia. Ítem, ñandú, acción y pingüino.',
    )
    expect(text).toContain('VERTICE SERVICIOS INTEGRALES S.R.L.')
    expect(text).not.toContain('\u001c')
  }
  for (const text of await Promise.all([
    textFor('mensual'),
    textFor('jornada'),
  ])) {
    expect(text).toContain('BONIFICADA')
    expect(text).toContain(
      'Oficina, flota y eficiencia. Ítem, ñandú, acción y pingüino.',
    )
    expect(text).not.toContain('\u001c')
  }
})
