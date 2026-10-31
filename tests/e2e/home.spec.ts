import { expect, test } from '@playwright/test'
import { conBase } from './base-datos'
import { iniciarSesion, sufijoUnico } from './helpers'

const marca = `inicio-e2e-${sufijoUnico()}`
const razonSocial = `Grúas Ñandú ${marca}`
const numeroRemito = `R-${marca}-001`
const numeroFactura = `F-${marca}-002`
let clienteId: string
let presupuestoId: string
let cotizacionId: string
let remitoId: string
let facturaId: string

test.beforeAll(async () => {
  await conBase(async (db) => {
    const cliente = await db.query<{ id: string }>(
      `insert into public.clientes (razon_social, telefono, email, notas) values ($1, '299 555-1223', 'contacto@inicio.test', $2) returning id`,
      [razonSocial, marca],
    )
    clienteId = cliente.rows[0].id
    const presupuesto = await db.query<{ id: string }>(
      `insert into public.cotizaciones
        (cliente_id, origen, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado, fecha_proxima_actualizacion)
       values ($1, 'directa', 'jornada', 'Izaje en Añelo', $2, '2018-01-01', 'aprobada', '2018-01-01', 'en_curso', '2018-02-01') returning id`,
      [clienteId, marca],
    )
    presupuestoId = presupuesto.rows[0].id
    const cotizacion = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, asunto, notas, fecha, estado)
       values ($1, 'jornada', 'Seguimiento de obra', $2, '2018-01-01', 'enviada') returning id`,
      [clienteId, marca],
    )
    cotizacionId = cotizacion.rows[0].id
    const remito = await db.query<{ id: string }>(
      `insert into public.documentos (cliente_id, tipo, numero, fecha, notas)
       values ($1, 'remito', $2, '2018-01-01', $3) returning id`,
      [clienteId, numeroRemito, marca],
    )
    remitoId = remito.rows[0].id
    const factura = await db.query<{ id: string }>(
      `insert into public.documentos (cliente_id, tipo, numero, fecha, monto, tipo_comprobante, notas)
       values ($1, 'factura', $2, '2018-01-01', 125000, 'FA', $3) returning id`,
      [clienteId, numeroFactura, marca],
    )
    facturaId = factura.rows[0].id
    await db.query('insert into public.documento_presupuestos values ($1, $3), ($2, $3)', [remitoId, facturaId, presupuestoId])
  })
})

test.afterAll(async () => {
  if (!clienteId) return
  await conBase(async (db) => {
    await db.query('delete from public.documentos where cliente_id = $1', [clienteId])
    await db.query('delete from public.cotizaciones where cliente_id = $1', [clienteId])
    await db.query('delete from public.clientes where id = $1', [clienteId])
  })
})

test('búsqueda global encuentra cliente sin acentos y documento, y abre cada registro', async ({ page }) => {
  await iniciarSesion(page)
  const buscador = page.locator('aside').getByRole('search', { name: 'Búsqueda global' })
  await buscador.getByLabel('Buscar en todo el sistema').fill(`gruas nandu ${marca}`)
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click()
  const clientes = page.getByRole('region', { name: 'Clientes', exact: true })
  await clientes.getByRole('link', { name: new RegExp(razonSocial) }).click()
  await expect(page).toHaveURL(`/clientes/${clienteId}`)
  await expect(page.getByRole('heading', { name: razonSocial, exact: true })).toBeVisible()

  await buscador.getByLabel('Buscar en todo el sistema').fill(numeroRemito.replaceAll('-', ''))
  await buscador.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('region', { name: 'Remitos', exact: true }).getByRole('link', { name: new RegExp(numeroRemito) }).click()
  await expect(page).toHaveURL(`/documentos/${remitoId}`)
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue(numeroRemito)
})

test('cinco colas accionables con selección de remito/factura y navegación móvil', async ({ page }, testInfo) => {
  await iniciarSesion(page)
  await page.setViewportSize({ width: 1200, height: 805 })
  for (const nombre of ['Seguimiento', 'Falta OC', 'Para facturar', 'Cobranzas', 'Actualización de tarifa']) {
    await expect(page.getByRole('heading', { name: nombre, exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('total-cobranzas')).toContainText('$')
  await expect(page.getByRole('link', { name: 'Subir documento', exact: true }).first()).toHaveAttribute('href', '/documentos/nuevo')
  await page.screenshot({ path: testInfo.outputPath('inicio-escritorio.png'), fullPage: true })

  await page.goto('/?cola=falta_oc')
  await page.locator(`[data-pendiente="${presupuestoId}"]`).getByRole('link', { name: /Cargar OC/ }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${presupuestoId}\\?nuevo=orden_compra`))
  await expect(page.getByRole('radio', { name: 'Orden de compra', exact: true })).toBeChecked()

  await page.goto('/?cola=para_facturar')
  await page.locator(`[data-pendiente="${remitoId}"]`).getByRole('link', { name: /Facturar/ }).click()
  await expect(page.getByRole('checkbox', { name: `Remito ${numeroRemito}`, exact: true })).toBeChecked()

  await page.goto('/?cola=cobranzas')
  await page.locator(`[data-pendiente="${facturaId}"]`).getByRole('link', { name: /Registrar pago/ }).click()
  await expect(page.getByRole('checkbox', { name: new RegExp(numeroFactura) })).toBeChecked()
  await expect(page.getByLabel('Monto de la orden de pago', { exact: true })).toHaveValue('125.000,00')

  await page.goto('/?cola=seguimiento')
  await page.locator(`[data-pendiente="${cotizacionId}"]`).getByRole('link', { name: /Registrar respuesta/ }).click()
  await expect(page).toHaveURL(`/cotizaciones/${cotizacionId}`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('inicio-movil.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Abrir búsqueda global', exact: true }).click()
  const dialogo = page.getByRole('dialog', { name: 'Buscar en todo el sistema', exact: true })
  await dialogo.getByLabel('Buscar en todo el sistema').fill(numeroFactura)
  await dialogo.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('region', { name: 'Facturas', exact: true }).getByRole('link', { name: new RegExp(numeroFactura) }).click()
  await expect(page).toHaveURL(`/documentos/${facturaId}`)
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue(numeroFactura)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
