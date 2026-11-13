import { expect, it } from 'vitest'
import { FONT_COPY, renderFontStyles } from '.././font-test-fixtures'

it('prepara las cuatro variantes antes de las primeras renderizaciones concurrentes sin alterar ligaduras', async () => {
  const texts = await Promise.all([
    renderFontStyles('Ítem'),
    renderFontStyles(FONT_COPY),
    renderFontStyles(FONT_COPY),
  ])
  for (const text of texts.slice(1)) {
    expect(text.split(FONT_COPY)).toHaveLength(5)
    expect(text).not.toMatch(/[\u001c\uFB00-\uFB06]/u)
  }
})
