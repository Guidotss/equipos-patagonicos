import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { conBase } from './base-datos'
import { iniciarSesion, sufijoUnico } from './helpers'

const marca = `documentos-e2e-${sufijoUnico()}`
const razonSocial = `Grúas Ñandú Documentos ${marca}`
let clienteId: string
let presupuestoId: string

test.beforeAll(async () => {
  clienteId = await conBase(
    async (db) =>
      (
        await db.query<{ id: string }>(
          'insert into public.clientes (razon_social, notas) values ($1, $2) returning id',
          [razonSocial, marca],
        )
      ).rows[0].id,
  )
})
test.afterAll(async () => {
  process.loadEnvFile('.env.local')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data: objetos } = await admin.storage.from('documentos').list(`documentos/${clienteId}`, { limit: 1000 })
  if (objetos?.length)
    await admin.storage.from('documentos').remove(objetos.map((item) => `documentos/${clienteId}/${item.name}`))
  await conBase(async (db) => {
    await db.query(
      'delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1) or factura_id in (select id from public.documentos where cliente_id = $1)',
      [clienteId],
    )
    await db.query('update public.documentos set factura_id = null where cliente_id = $1', [clienteId])
    await db.query('delete from public.documentos where cliente_id = $1', [clienteId])
    await db.query('delete from public.cotizaciones where cliente_id = $1', [clienteId])
    await db.query('delete from public.clientes where id = $1', [clienteId])
  })
})

async function adjuntar(page: Page, nombre: string) {
  await page
    .getByLabel('Seleccionar archivos del documento', { exact: true })
    .setInputFiles({
      name: nombre,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),
    })
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
}
async function guardar(page: Page) {
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${presupuestoId}$`))
}

test('presupuesto directo → OC → remito → factura → pago; saldo y anulación/restauración', async ({
  page,
}, testInfo) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/directo')
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByPlaceholder('Razón social, CUIT o contacto').fill(razonSocial)
  await page.getByRole('option', { name: new RegExp(razonSocial) }).click()
  await page.getByLabel('Descripción del trabajo', { exact: true }).fill('Izaje y montaje de estructura en Añelo')
  await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click()
  await expect(page).toHaveURL(/\/presupuestos\/[0-9a-f-]{36}$/)
  presupuestoId = page.url().split('/').at(-1)!
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')

  await page.getByRole('link', { name: 'Agregar Orden de compra', exact: true }).click()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('OC-101')
  await adjuntar(page, 'Orden de compra.pdf')
  await guardar(page)
  await expect(page.getByRole('heading', { name: 'Órdenes de compra · 1', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Agregar Remito', exact: true }).click()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-102')
  await adjuntar(page, 'Remito.pdf')
  await guardar(page)
  const remito = page.locator('[data-documento]').filter({ hasText: 'R-102' })
  await expect(remito.getByText('Sin facturar', { exact: true })).toBeVisible()
  await remito.getByRole('link', { name: 'Facturar', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Remito R-102', exact: true })).toBeChecked()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('F-103')
  await page.getByLabel('Monto total con IVA', { exact: true }).fill('abc')
  await adjuntar(page, 'Factura.pdf')
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page.getByText('Monto inválido', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue('F-103')
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
  await page.getByLabel('Monto total con IVA', { exact: true }).fill('1.000,00')
  await guardar(page)
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 1.000,00')
  await expect(remito.getByText('Facturado', { exact: true })).toBeVisible()

  const factura = page.locator('[data-documento]').filter({ hasText: 'FA F-103' })
  await factura.getByRole('link', { name: 'Registrar pago', exact: true }).click()
  await expect(page.getByLabel('Monto de la orden de pago', { exact: true })).toHaveValue('1.000,00')
  await expect(page.getByRole('checkbox', { name: /FA F-103/ })).toBeChecked()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('OP-104')
  await adjuntar(page, 'Orden de pago.pdf')
  await guardar(page)
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')
  await expect(factura.getByText('Cobrada', { exact: true })).toBeVisible()

  const pago = page.locator('[data-documento]').filter({ hasText: 'OP-104' })
  await pago.getByRole('button', { name: 'Anular', exact: true }).click()
  await pago.getByRole('button', { name: 'Confirmar anulación', exact: true }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 1.000,00')
  await pago.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')
  await expect(factura.getByText('Cobrada', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1200, height: 805 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => window.scrollY === 0)
  await page.screenshot({ path: testInfo.outputPath('presupuesto-escritorio.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/documentos/nuevo?presupuesto=${presupuestoId}`)
  await expect(page.getByRole('radio', { name: 'Remito', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('documento-movil.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('subida móvil múltiple, compresión de foto, reintento y edición de archivos/vínculos', async ({
  page,
}, testInfo) => {
  const presupuesto = await conBase(
    async (db) =>
      (
        await db.query<{ id: string; numero: string }>(
          `insert into public.cotizaciones (cliente_id, origen, formato, asunto, notas, estado, fecha_aprobacion, presupuesto_estado) values ($1, 'directa', 'jornada', 'Segundo frente de trabajo', $2, 'aprobada', current_date, 'en_curso') returning id, numero`,
          [clienteId, marca],
        )
      ).rows[0],
  )
  await iniciarSesion(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/documentos/nuevo?presupuesto=${presupuesto.id}`)
  await expect(page.getByLabel('Tomar foto del documento', { exact: true })).toHaveAttribute('capture', 'environment')
  await expect(page.getByLabel('Seleccionar archivos del documento', { exact: true })).toHaveAttribute('multiple', '')
  const foto = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 2400
    const contexto = canvas.getContext('2d')!
    contexto.fillStyle = '#eeeeee'
    contexto.fillRect(0, 0, 3000, 2400)
    contexto.fillStyle = '#333333'
    contexto.font = '80px sans-serif'
    contexto.fillText('Remito de prueba', 100, 200)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  let interrumpido = false
  await page.route('**/storage/v1/object/upload/sign/**', async (ruta) => {
    if (ruta.request().method() === 'PUT' && !interrumpido) {
      interrumpido = true
      await ruta.abort('internetdisconnected')
    } else await ruta.continue()
  })
  await page.getByLabel('Seleccionar archivos del documento', { exact: true }).setInputFiles([
    { name: 'Remito foto.png', mimeType: 'image/png', buffer: Buffer.from(foto, 'base64') },
    { name: 'Segunda hoja.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') },
  ])
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByText('Listo para guardar', { exact: true })).toHaveCount(2)
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-MOVIL-105')
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${presupuesto.id}$`))
  const remito = page.locator('[data-documento]').filter({ hasText: 'R-MOVIL-105' })
  await expect(remito.getByRole('link', { name: 'Remito foto.png', exact: true })).toBeVisible()
  const archivo = await conBase(
    async (db) =>
      (
        await db.query<{ mime: string; tamano: string }>(
          `select a.mime, a.tamano from public.documento_archivos a join public.documentos d on d.id = a.documento_id where d.cliente_id = $1 and d.numero = 'R-MOVIL-105' and a.nombre_original = 'Remito foto.png'`,
          [clienteId],
        )
      ).rows[0],
  )
  expect(archivo.mime).toBe('image/jpeg')
  expect(Number(archivo.tamano)).toBeLessThan(10 * 1024 * 1024)
  await remito.getByRole('link', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-MOVIL-106')
  const segundaHoja = page.getByRole('listitem').filter({ hasText: 'Segunda hoja.pdf' })
  await segundaHoja.getByRole('button', { name: 'Quitar', exact: true }).click()
  await adjuntar(page, 'Hoja corregida.pdf')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page).toHaveURL(/\/presupuestos\/[0-9a-f-]{36}$/)
  const actualizado = page.locator('[data-documento]').filter({ hasText: 'R-MOVIL-106' })
  await expect(actualizado.getByRole('link', { name: 'Hoja corregida.pdf', exact: true })).toBeVisible()
  await expect(actualizado.getByRole('link', { name: 'Segunda hoja.pdf', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('presupuesto-movil.png'), fullPage: true })
})
