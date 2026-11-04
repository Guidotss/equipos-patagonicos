import { expect, test, type Page } from '@playwright/test'
import { crearQuoteComplete, withBase } from './database'
import { iniciarSession } from './helpers'

let quoteId: string

test.beforeEach(async ({ page }) => {
  quoteId = await withBase(async (db) => {
    const { id } = await crearQuoteComplete(db)
    await db.query('delete from public.cotizacion_items where cotizacion_id = $1', [id])
    await db.query(
      `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Jornada', 'Primera jornada', 1950000, 'JORNADA'),
       ($1, 2, 'Jornada', 'Movilización', 2800000, 'VIAJE'),
       ($1, 3, 'Adicional', 'Hora adicional', 195000, 'HORA'),
       ($1, 4, 'Jornada', 'Última jornada', 1950000, 'JORNADA')`, [id],
    )
    return id
  })
  await iniciarSession(page)
  await page.goto(`/cotizaciones/${quoteId}`)
})

test.afterEach(async () => {
  await withBase((db) => db.query('delete from public.cotizaciones where id = $1', [quoteId]))
})

const description = (page: Page, number: number) => page.getByLabel(`Descripción del ítem ${number}`, { exact: true })
const section = (page: Page, number: number) => page.getByLabel(`Nombre de la sección ${number}`, { exact: true })
const removeSection = (page: Page, number: number) => page.getByRole('button', { name: `Eliminar sección ${number}`, exact: true })
const confirmation = (page: Page, name: string) => page.getByRole('group', { name: `¿Eliminar la sección «${name}»?` })

test('borrar filas enfoca el vecino y la última vuelve a Agregar ítem', async ({ page }) => {
  await page.getByRole('button', { name: 'Eliminar ítem 2', exact: true }).click()
  await expect(description(page, 1)).toBeFocused()
  await expect(description(page, 2)).toHaveValue('Hora adicional')
  await page.getByRole('button', { name: 'Eliminar ítem 1', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(description(page, 1)).toBeFocused()
  await expect(description(page, 1)).toHaveValue('Hora adicional')
  await page.getByRole('button', { name: 'Eliminar ítem 1', exact: true }).click()
  await page.getByRole('button', { name: 'Eliminar ítem 1', exact: true }).click()
  await expect(page.getByText('Todavía no hay ítems.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar ítem', exact: true })).toBeFocused()
})

test('borra solo una racha, permite cancelar y elimina la sección final', async ({ page }) => {
  await removeSection(page, 1).click()
  const request = confirmation(page, 'Jornada')
  await expect(request.getByText('Se eliminarán sus 2 ítems.')).toBeVisible()
  await expect(request.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(description(page, 4)).toHaveValue('Última jornada')
  await expect(section(page, 1)).toBeFocused()
  await removeSection(page, 1).click()
  await request.getByRole('button', { name: 'Eliminar sección', exact: true }).click()
  await expect(description(page, 1)).toHaveValue('Hora adicional')
  await expect(description(page, 1)).toBeFocused()
  await expect(description(page, 2)).toHaveValue('Última jornada')
  await removeSection(page, 2).click()
  await confirmation(page, 'Jornada').getByRole('button', { name: 'Eliminar sección', exact: true }).click()
  await expect(description(page, 1)).toBeFocused()
  await removeSection(page, 1).click()
  await expect(confirmation(page, 'Adicional').getByText('Se eliminará su 1 ítem.')).toBeVisible()
  await confirmation(page, 'Adicional').getByRole('button', { name: 'Eliminar sección', exact: true }).click()
  await expect(page.getByText('Todavía no hay ítems.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar ítem', exact: true })).toBeFocused()
})

test('clic en eliminar congela las filas antes del blur que une las secciones', async ({ page }) => {
  await section(page, 2).fill('Jornada')
  await removeSection(page, 2).click()
  const request = confirmation(page, 'Jornada')
  await expect(request.getByText('Se eliminará su 1 ítem.')).toBeVisible()
  await expect(section(page, 2)).toHaveCount(0)
  await request.getByRole('button', { name: 'Cancelar' }).click()
  await expect(description(page, 3)).toBeFocused()
  await expect(description(page, 4)).toHaveValue('Última jornada')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.reload()
  await expect(section(page, 2)).toHaveCount(0)
  await expect(description(page, 3)).toHaveValue('Hora adicional')
})

test('Tab y Enter solicitan borrar la racha original, sin confirmar con el mismo Enter', async ({ page }) => {
  await section(page, 2).fill('Jornada')
  await page.keyboard.press('Tab')
  await expect(removeSection(page, 2)).toBeFocused()
  await page.keyboard.press('Enter')
  const request = confirmation(page, 'Jornada')
  await expect(request.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await expect(request.getByText('Se eliminará su 1 ítem.')).toBeVisible()
  await expect(description(page, 4)).toHaveValue('Última jornada')
  await request.getByRole('button', { name: 'Eliminar sección', exact: true }).click()
  await expect(description(page, 2)).toBeFocused()
  await expect(description(page, 3)).toHaveValue('Última jornada')
  await expect(description(page, 4)).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.reload()
  await expect(description(page, 3)).toHaveValue('Última jornada')
  await expect(description(page, 4)).toHaveCount(0)
})

test('las plantillas comparten el borrado visible de filas y secciones sin precios', async ({ page }) => {
  const templateId = await withBase(async (db) => (await db.query<{ id: string }>(
    "select id from public.plantillas where nombre = 'Por jornada - Grúa con operador'",
  )).rows[0].id)
  await page.goto(`/configuracion/plantillas/${templateId}/editar`)
  await expect(page.getByLabel('Precio del ítem 1', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Eliminar ítem 2', exact: true }).click()
  await expect(description(page, 1)).toBeFocused()
  await removeSection(page, 1).click()
  await confirmation(page, 'Precios Jornada').getByRole('button', { name: 'Eliminar sección', exact: true }).click()
  await expect(description(page, 1)).toBeFocused()
  await expect(description(page, 2)).toHaveCount(0)
})

test('controles visibles y columnas alineadas en escritorio y móvil', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const remove = page.getByRole('button', { name: 'Eliminar ítem 1', exact: true })
    await expect(remove).toBeVisible()
    await expect(removeSection(page, 1)).toBeVisible()
    await remove.scrollIntoViewIfNeeded()
    const width = await page.evaluate(() => ({ available: innerWidth, used: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) }))
    expect(width.used).toBeLessThanOrEqual(width.available)
    const target = await remove.boundingBox()
    if (viewport.width < 700) {
      expect(target!.width).toBeGreaterThanOrEqual(44)
      expect(target!.height).toBeGreaterThanOrEqual(44)
    } else {
      const first = await page.getByLabel('Cantidad del ítem 1', { exact: true }).boundingBox()
      const second = await page.getByLabel('Cantidad del ítem 2', { exact: true }).boundingBox()
      expect(Math.abs(first!.x - second!.x)).toBeLessThan(1)
      expect(Math.abs(first!.y - target!.y)).toBeLessThan(2)
    }
    await page.screenshot({ path: testInfo.outputPath(`quote-controls-${viewport.width}.png`), fullPage: false })
  }
})
