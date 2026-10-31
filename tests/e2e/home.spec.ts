import { expect, test } from '@playwright/test'
import { withBase } from './database'
import { iniciarSession, sufijoUnico } from './helpers'

const marca = `inicio-e2e-${sufijoUnico()}`
const razonSocial = `Grúas Ñandú ${marca}`
const numberDeliveryNote = `R-${marca}-001`
const numberInvoice = `F-${marca}-002`
let clientId: string
let budgetId: string
let quoteId: string
let deliveryNoteId: string
let invoiceId: string

test.beforeAll(async () => {
  await withBase(async (db) => {
    const cliente = await db.query<{ id: string }>(
      `insert into public.clientes (razon_social, telefono, email, notas) values ($1, '299 555-1223', 'contacto@inicio.test', $2) returning id`,
      [razonSocial, marca],
    )
    clientId = cliente.rows[0].id
    const budget = await db.query<{ id: string }>(
      `insert into public.cotizaciones
        (cliente_id, origen, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado, fecha_proxima_actualizacion)
       values ($1, 'directa', 'jornada', 'Izaje en Añelo', $2, '2018-01-01', 'aprobada', '2018-01-01', 'en_curso', '2018-02-01') returning id`,
      [clientId, marca],
    )
    budgetId = budget.rows[0].id
    const quote = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, asunto, notas, fecha, estado)
       values ($1, 'jornada', 'Seguimiento de obra', $2, '2018-01-01', 'enviada') returning id`,
      [clientId, marca],
    )
    quoteId = quote.rows[0].id
    const deliveryNote = await db.query<{ id: string }>(
      `insert into public.documentos (cliente_id, tipo, numero, fecha, notas)
       values ($1, 'remito', $2, '2018-01-01', $3) returning id`,
      [clientId, numberDeliveryNote, marca],
    )
    deliveryNoteId = deliveryNote.rows[0].id
    const invoice = await db.query<{ id: string }>(
      `insert into public.documentos (cliente_id, tipo, numero, fecha, monto, tipo_comprobante, notas)
       values ($1, 'factura', $2, '2018-01-01', 125000, 'FA', $3) returning id`,
      [clientId, numberInvoice, marca],
    )
    invoiceId = invoice.rows[0].id
    await db.query('insert into public.documento_presupuestos values ($1, $3), ($2, $3)', [deliveryNoteId, invoiceId, budgetId])
  })
})

test.afterAll(async () => {
  if (!clientId) return
  await withBase(async (db) => {
    await db.query('delete from public.documentos where cliente_id = $1', [clientId])
    await db.query('delete from public.cotizaciones where cliente_id = $1', [clientId])
    await db.query('delete from public.clientes where id = $1', [clientId])
  })
})

test('búsqueda global encuentra cliente sin acentos y documento, y abre cada registro', async ({ page }) => {
  await iniciarSession(page)
  const search = page.locator('aside').getByRole('search', { name: 'Búsqueda global' })
  await search.getByLabel('Buscar en todo el sistema').fill(`gruas nandu ${marca}`)
  await search.getByRole('button', { name: 'Buscar', exact: true }).click()
  const clientes = page.getByRole('region', { name: 'Clientes', exact: true })
  await clientes.getByRole('link', { name: new RegExp(razonSocial) }).click()
  await expect(page).toHaveURL(`/clientes/${clientId}`)
  await expect(page.getByRole('heading', { name: razonSocial, exact: true })).toBeVisible()

  await search.getByLabel('Buscar en todo el sistema').fill(numberDeliveryNote.replaceAll('-', ''))
  await search.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('region', { name: 'Remitos', exact: true }).getByRole('link', { name: new RegExp(numberDeliveryNote) }).click()
  await expect(page).toHaveURL(`/documentos/${deliveryNoteId}`)
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue(numberDeliveryNote)
})

test('cinco colas accionables con selección de remito/factura y navegación móvil', async ({ page }, testInfo) => {
  await iniciarSession(page)
  await page.setViewportSize({ width: 1200, height: 805 })
  for (const nombre of ['Seguimiento', 'Falta OC', 'Para facturar', 'Cobranzas', 'Actualización de tarifa']) {
    await expect(page.getByRole('heading', { name: nombre, exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('total-cobranzas')).toContainText('$')
  await expect(page.getByRole('link', { name: 'Subir documento', exact: true }).first()).toHaveAttribute('href', '/documentos/nuevo')
  await page.screenshot({ path: testInfo.outputPath('inicio-escritorio.png'), fullPage: true })

  await page.goto('/?cola=falta_oc')
  await page.locator(`[data-pendiente="${budgetId}"]`).getByRole('link', { name: /Cargar OC/ }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${budgetId}\\?nuevo=orden_compra`))
  await expect(page.getByRole('radio', { name: 'Orden de compra', exact: true })).toBeChecked()

  await page.goto('/?cola=para_facturar')
  await page.locator(`[data-pendiente="${deliveryNoteId}"]`).getByRole('link', { name: /Facturar/ }).click()
  await expect(page.getByRole('checkbox', { name: `Remito ${numberDeliveryNote}`, exact: true })).toBeChecked()

  await page.goto('/?cola=cobranzas')
  await page.locator(`[data-pendiente="${invoiceId}"]`).getByRole('link', { name: /Registrar pago/ }).click()
  await expect(page.getByRole('checkbox', { name: new RegExp(numberInvoice) })).toBeChecked()
  await expect(page.getByLabel('Monto de la orden de pago', { exact: true })).toHaveValue('125.000,00')

  await page.goto('/?cola=seguimiento')
  await page.locator(`[data-pendiente="${quoteId}"]`).getByRole('link', { name: /Registrar respuesta/ }).click()
  await expect(page).toHaveURL(`/cotizaciones/${quoteId}`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('inicio-movil.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Abrir búsqueda global', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Buscar en todo el sistema', exact: true })
  await dialog.getByLabel('Buscar en todo el sistema').fill(numberInvoice)
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('region', { name: 'Facturas', exact: true }).getByRole('link', { name: new RegExp(numberInvoice) }).click()
  await expect(page).toHaveURL(`/documentos/${invoiceId}`)
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue(numberInvoice)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
