import { expect, test } from '@playwright/test'
import { crearQuoteComplete, withBase } from './database'
import { iniciarSession } from './helpers'

let quoteId: string

test.beforeEach(async ({ page }) => {
  quoteId = await withBase(async (db) => (await crearQuoteComplete(db)).id)
  await iniciarSession(page)
  await page.goto(`/cotizaciones/${quoteId}`)
})
test.afterEach(async () => {
  await withBase((db) => db.query('delete from public.cotizaciones where id=$1', [quoteId]))
})

test('marca, duplica, guarda y reabre; desmarcar vuelve a pedir una tarifa', async ({ page }) => {
  const mark = (number: number) => page.getByRole('checkbox', { name: `Bonificada del ítem ${number}`, exact: true })
  const price = (number: number) => page.getByLabel(`Precio del ítem ${number}`, { exact: true })
  await mark(2).check()
  await expect(price(2)).toBeDisabled()
  await expect(price(2)).toHaveValue('BONIFICADA')
  await expect(page.getByLabel('Total del ítem 2', { exact: true })).toHaveText('0,00')
  await page.getByRole('button', { name: 'Opciones del ítem 2', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Duplicar fila', exact: true }).click()
  await expect(mark(3)).toBeChecked()
  await expect(page.getByLabel('Descripción del ítem 3', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Cotización guardada', { exact: true })).toBeVisible()
  await page.reload()
  await expect(mark(2)).toBeChecked()
  await expect(mark(3)).toBeChecked()
  const saved = await withBase(async (db) => (await db.query('select is_complimentary,precio_unitario,total from public.cotizacion_items where cotizacion_id=$1 order by orden', [quoteId])).rows)
  expect(saved).toEqual([{ is_complimentary: false, precio_unitario: '1950000.00', total: '1950000.00' }, { is_complimentary: true, precio_unitario: '0.00', total: '0.00' }, { is_complimentary: true, precio_unitario: '0.00', total: '0.00' }])
  await mark(2).focus()
  await page.keyboard.press('Space')
  await expect(price(2)).toBeEnabled()
  await expect(price(2)).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Descargar y marcar enviada', exact: true })).toBeDisabled()
  await price(2).fill('0')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Cotización guardada', { exact: true })).toBeVisible()
  await page.reload()
  await expect(mark(2)).not.toBeChecked()
  await expect(price(2)).toHaveValue('0,00')
})
