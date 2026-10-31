import { expect, test } from '@playwright/test'
import { withBase, crearQuoteComplete } from './database'
import { iniciarSession, sufijoUnico } from './helpers'

const marca = `grilla-e2e-${sufijoUnico()}`
let clientes: string[] = []
let quote: string
let budget: string

test.beforeAll(async () => {
  await withBase(async (db) => {
    const r = await db.query<{ id: string }>(
      `insert into public.clientes(razon_social,localidad,notas)
       select 'Ingeniería, Montajes y Servicios de la Patagonia ' || $1 || ' ' || n, 'Neuquén', $1
       from generate_series(1,26) n returning id`, [marca],
    )
    clientes = r.rows.map((row) => row.id)
    const base = await crearQuoteComplete(db)
    quote = base.id
    await db.query('update public.cotizaciones set cliente_id=$1,notas=$2 where id=$3', [clientes[0], marca, quote])
    budget = (await db.query<{ id: string }>(
      `insert into public.cotizaciones(cliente_id,origen,formato,asunto,estado,fecha_aprobacion,presupuesto_estado,notas)
       values($1,'directa','jornada','Izaje para prueba de filtros','aprobada',current_date,'en_curso',$2) returning id`,
      [clientes[0], marca],
    )).rows[0].id
  })
})

test.afterAll(async () => {
  await withBase(async (db) => {
    await db.query('delete from public.cotizaciones where id=any($1::uuid[])', [[quote, budget]])
    await db.query('delete from public.clientes where id=any($1::uuid[])', [clientes])
  })
})

test('Clientes conserva la búsqueda al paginar y abre el registro desde el espacio de la fila', async ({ page, baseURL }) => {
  await iniciarSession(page)
  await page.goto(`/clientes?q=${marca}`)
  await expect(page.getByText('Mostrando 1–25 de 26')).toBeVisible()
  await page.getByRole('link', { name: 'Siguiente', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`q=${marca}.*pagina=2`))
  await expect(page.getByText('Mostrando 26–26 de 26')).toBeVisible()
  const row = page.getByRole('table').getByRole('row').nth(1)
  const enlace = row.getByRole('link').first()
  const href = await enlace.getAttribute('href')
  await row.getByRole('cell').first().click({ position: { x: 3, y: 3 } })
  await expect(page).toHaveURL(new URL(href!, baseURL).href)
})

test('el encabezado de la grilla permanece visible al recorrer los resultados', async ({ page }) => {
  await iniciarSession(page)
  await page.goto(`/clientes?q=${marca}`)
  const table = page.getByRole('table')
  const container = table.locator('..')
  await container.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(async () => {
    const header = await table.getByRole('columnheader').first().boundingBox()
    const caja = await container.boundingBox()
    return header && caja ? Math.abs(header.y - caja.y) : Infinity
  }).toBeLessThan(2)
})

test('los clientes de nombre largo conservan datos y navegación sin desborde móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await iniciarSession(page)
  await page.goto(`/clientes?q=${marca}`)
  await expect(page.getByText('Mostrando 1–25 de 26')).toBeVisible()
  await expect(page.getByRole('list').getByText('Neuquén', { exact: true }).first()).toBeVisible()
  const ancho = await page.evaluate(() => ({ disponible: innerWidth, usado: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) }))
  expect(ancho.usado).toBeLessThanOrEqual(ancho.disponible)
  await page.getByRole('link', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByText('Mostrando 26–26 de 26')).toBeVisible()
})

test('a 1200px los ítems usan el ancho de trabajo y el PDF sigue disponible en el panel', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 805 })
  await iniciarSession(page)
  await page.goto(`/cotizaciones/${quote}`)
  await expect(page.getByRole('region', { name: 'Vista previa', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Vista previa del PDF', exact: true })
  await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.getByLabel('Precio del ítem 1', { exact: true })).toBeEnabled()
})

test('en móvil cada precio tiene contexto y sigue calculando su total al editar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await iniciarSession(page)
  await page.goto(`/cotizaciones/${quote}`)
  await expect(page.locator('label').filter({ hasText: /^Precio unitario$/ }).first()).toBeVisible()
  await expect(page.getByText('Total del ítem', { exact: true }).first()).toBeVisible()
  const price = page.getByLabel('Precio del ítem 1', { exact: true })
  await price.fill('39.000.000,00')
  await price.press('Tab')
  await expect(price).toHaveValue('39.000.000,00')
  await expect(page.getByText('39.000.000,00', { exact: true }).first()).toBeVisible()
})

test('Presupuestos sincroniza los controles al limpiar filtros y al volver', async ({ page, baseURL }) => {
  await iniciarSession(page)
  await page.goto(`/presupuestos?q=${marca}`)
  const estado = page.getByRole('combobox', { name: 'Estado', exact: true })
  await estado.selectOption('finalizado')
  await expect(page).toHaveURL(/estado=finalizado/)
  await page.getByRole('link', { name: 'Limpiar filtros', exact: true }).first().click()
  await expect(page).toHaveURL(`${baseURL}/presupuestos`)
  await expect(estado).toHaveValue('')
  await expect(page.getByRole('searchbox', { name: 'Buscar presupuestos' })).toHaveValue('')
  await page.goBack()
  await expect(page).toHaveURL(/estado=finalizado/)
  await expect(estado).toHaveValue('finalizado')
  await expect(page.getByRole('searchbox', { name: 'Buscar presupuestos' })).toHaveValue(marca)
})
