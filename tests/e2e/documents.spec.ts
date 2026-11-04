import { validateEnvTests } from '../../scripts/test-env.mjs'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { withBase } from './database'
import { iniciarSession, sufijoUnico } from './helpers'

const marca = `documentos-e2e-${sufijoUnico()}`
const razonSocial = `Grúas Ñandú Documentos ${marca}`
let clientId: string
let budgetId: string
let historicEquipmentId: string

test.beforeAll(async () => {
  historicEquipmentId = await withBase(async (db) => (
    await db.query<{ id: string }>(
      'insert into public.equipos (nombre, activo) values ($1, false) returning id',
      [`Grúa histórica ${marca}`],
    )
  ).rows[0].id)
  clientId = await withBase(
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
  validateEnvTests()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data: objects } = await admin.storage.from('documentos').list(`documentos/${clientId}`, { limit: 1000 })
  if (objects?.length)
    await admin.storage.from('documentos').remove(objects.map((item) => `documentos/${clientId}/${item.name}`))
  await withBase(async (db) => {
    await db.query(
      'delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1) or factura_id in (select id from public.documentos where cliente_id = $1)',
      [clientId],
    )
    await db.query('update public.documentos set factura_id = null where cliente_id = $1', [clientId])
    await db.query('delete from public.documentos where cliente_id = $1', [clientId])
    await db.query('delete from public.cotizaciones where cliente_id = $1', [clientId])
    await db.query('delete from public.clientes where id = $1', [clientId])
    await db.query('delete from public.equipos where id = $1', [historicEquipmentId])
  })
})

async function readyNewDocumentForm(page: Page) {
  // Verifica los eventos de React antes de cambiar el selector nativo.
  await page.getByRole('radio', { name: 'Factura', exact: true }).click()
  await expect(page.getByLabel('Monto total con IVA', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Remito', exact: true }).click()
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveValue('Seleccioná un presupuesto')
}

async function attach(page: Page, nombre: string) {
  await page
    .getByLabel('Seleccionar archivos del documento', { exact: true })
    .setInputFiles({
      name: nombre,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),
    })
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${budgetId}$`))
}

test('presupuesto directo → OC → remito → factura → pago; saldo y anulación/restauración', async ({
  page,
}, testInfo) => {
  await iniciarSession(page)
  await page.goto('/cotizaciones/directo')
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByPlaceholder('Razón social, CUIT o contacto').fill(razonSocial)
  await page.getByRole('option', { name: new RegExp(razonSocial) }).click()
  await page.getByLabel('Descripción del trabajo', { exact: true }).fill('Izaje y montaje de estructura en Añelo')
  await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click()
  await expect(page).toHaveURL(/\/presupuestos\/[0-9a-f-]{36}$/)
  budgetId = page.url().split('/').at(-1)!
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')

  await page.getByRole('link', { name: 'Agregar Orden de compra', exact: true }).click()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('OC-101')
  await attach(page, 'Orden de compra.pdf')
  await save(page)
  await expect(page.getByRole('heading', { name: 'Órdenes de compra · 1', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Agregar Remito', exact: true }).click()
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveValue('Sin equipo asignado')
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-102')
  await attach(page, 'Remito.pdf')
  await save(page)
  const deliveryNote = page.locator('[data-documento]').filter({ hasText: 'R-102' })
  await expect(deliveryNote.getByText('Sin facturar', { exact: true })).toBeVisible()
  await deliveryNote.getByRole('link', { name: 'Facturar', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Remito R-102', exact: true })).toBeChecked()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('F-103')
  await page.getByLabel('Monto total con IVA', { exact: true }).fill('abc')
  await attach(page, 'Factura.pdf')
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page.getByText('Monto inválido', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Número (opcional)', { exact: true })).toHaveValue('F-103')
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
  await page.getByLabel('Monto total con IVA', { exact: true }).fill('1.000,00')
  await save(page)
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 1.000,00')
  await expect(deliveryNote.getByText('Facturado', { exact: true })).toBeVisible()

  const invoice = page.locator('[data-documento]').filter({ hasText: 'FA F-103' })
  await invoice.getByRole('link', { name: 'Registrar pago', exact: true }).click()
  await expect(page.getByLabel('Monto de la orden de pago', { exact: true })).toHaveValue('1.000,00')
  await expect(page.getByRole('checkbox', { name: /FA F-103/ })).toBeChecked()
  await page.getByLabel('Número (opcional)', { exact: true }).fill('OP-104')
  await attach(page, 'Orden de pago.pdf')
  await save(page)
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')
  await expect(invoice.getByText('Cobrada', { exact: true })).toBeVisible()

  const pago = page.locator('[data-documento]').filter({ hasText: 'OP-104' })
  await pago.getByRole('button', { name: 'Anular', exact: true }).click()
  await pago.getByRole('button', { name: 'Confirmar anulación', exact: true }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 1.000,00')
  await pago.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 0,00')
  await expect(invoice.getByText('Cobrada', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1200, height: 805 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => window.scrollY === 0)
  await page.screenshot({ path: testInfo.outputPath('presupuesto-escritorio.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/documentos/nuevo?presupuesto=${budgetId}`)
  await expect(page.getByRole('radio', { name: 'Remito', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('documento-movil.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('subida móvil múltiple, compresión de foto, reintento y edición de archivos/vínculos', async ({
  page,
}, testInfo) => {
  const budget = await withBase(
    async (db) =>
      (
        await db.query<{ id: string; numero: string }>(
          `insert into public.cotizaciones (cliente_id, origen, formato, asunto, notas, estado, fecha_aprobacion, presupuesto_estado, equipo_id) values ($1, 'directa', 'jornada', 'Segundo frente de trabajo', $2, 'aprobada', current_date, 'en_curso', $3) returning id, numero`,
          [clientId, marca, historicEquipmentId],
        )
      ).rows[0],
  )
  await iniciarSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/documentos/nuevo')
  await readyNewDocumentForm(page)
  await expect(page.getByLabel('Buscar presupuesto', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Presupuesto', { exact: true })).toHaveAttribute('required', '')
  await page.getByLabel('Presupuesto', { exact: true }).selectOption(budget.id)
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveValue(`Grúa histórica ${marca}`)
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveAttribute('readonly', '')
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
  await page.route('**/storage/v1/object/upload/sign/**', async (path) => {
    if (path.request().method() === 'PUT' && !interrumpido) {
      interrumpido = true
      await path.abort('internetdisconnected')
    } else await path.continue()
  })
  // El selector se abre desde React: evita seleccionar archivos antes de que se conecten los eventos del formulario.
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Seleccionar archivos', exact: true }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles([
    { name: 'Remito foto.png', mimeType: 'image/png', buffer: Buffer.from(foto, 'base64') },
    { name: 'Segunda hoja.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') },
  ])
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByText('Listo para guardar', { exact: true })).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('documento-equipo-movil.png'), fullPage: true })
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-MOVIL-105')
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${budget.id}$`))
  const deliveryNote = page.locator('[data-documento]').filter({ hasText: 'R-MOVIL-105' })
  await expect(deliveryNote.getByRole('link', { name: 'Remito foto.png', exact: true })).toBeVisible()
  const archivo = await withBase(
    async (db) =>
      (
        await db.query<{ mime: string; tamano: string }>(
          `select a.mime, a.tamano from public.documento_archivos a join public.documentos d on d.id = a.documento_id where d.cliente_id = $1 and d.numero = 'R-MOVIL-105' and a.nombre_original = 'Remito foto.png'`,
          [clientId],
        )
      ).rows[0],
  )
  expect(archivo.mime).toBe('image/jpeg')
  expect(Number(archivo.tamano)).toBeLessThan(10 * 1024 * 1024)
  await deliveryNote.getByRole('link', { name: 'Editar', exact: true }).click()
  await expect(page.getByLabel('Equipo', { exact: true })).toHaveValue(`Grúa histórica ${marca}`)
  await page.getByLabel('Número (opcional)', { exact: true }).fill('R-MOVIL-106')
  const segundaSheet = page.getByRole('listitem').filter({ hasText: 'Segunda hoja.pdf' })
  await segundaSheet.getByRole('button', { name: 'Quitar', exact: true }).click()
  await attach(page, 'Hoja corregida.pdf')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page).toHaveURL(/\/presupuestos\/[0-9a-f-]{36}$/)
  const actualizado = page.locator('[data-documento]').filter({ hasText: 'R-MOVIL-106' })
  await expect(actualizado.getByRole('link', { name: 'Hoja corregida.pdf', exact: true })).toBeVisible()
  await expect(actualizado.getByRole('link', { name: 'Segunda hoja.pdf', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('presupuesto-movil.png'), fullPage: true })
})

for (const uploadState of ['completed', 'pending'] as const) {
  test(`reintenta el contexto sin perder un archivo ${uploadState === 'completed' ? 'listo' : 'en curso'} y lo guarda`, async ({ page }) => {
    const budget = await withBase(async (db) => (await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, origen, formato, asunto, notas, estado, fecha_aprobacion, presupuesto_estado, equipo_id)
       values ($1, 'directa', 'jornada', 'Reintento de contexto', $2, 'aprobada', current_date, 'en_curso', $3) returning id`,
      [clientId, marca, historicEquipmentId],
    )).rows[0])
    await iniciarSession(page)
    await page.goto('/documentos/nuevo')
    await readyNewDocumentForm(page)
    let interrupted = false
    await page.route('**/documentos/nuevo', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action'] && !interrupted) {
        interrupted = true
        await route.abort('internetdisconnected')
      } else await route.continue()
    })
    await page.getByLabel('Presupuesto', { exact: true }).selectOption(budget.id)
    await expect(page.getByText('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.', { exact: true })).toBeVisible()
    expect(interrupted).toBe(true)
    await expect(page.getByLabel('Presupuesto', { exact: true })).toHaveValue('')
    const submit = page.getByRole('button', { name: 'Guardar documento', exact: true })
    await expect(submit).toBeDisabled()

    let releaseUpload = () => {}
    let observeUpload = () => {}
    const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve })
    const uploadStarted = new Promise<void>((resolve) => { observeUpload = resolve })
    if (uploadState === 'pending') {
      await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
        if (route.request().method() === 'PUT') {
          observeUpload()
          await uploadGate
        }
        await route.continue()
      })
    }
    const fileName = `Remito conservado ${uploadState}.pdf`
    try {
      await page.getByLabel('Seleccionar archivos del documento', { exact: true }).setInputFiles({
        name: fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 reintento de contexto'),
      })
      if (uploadState === 'pending') await uploadStarted
      else await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
      await page.getByLabel('Presupuesto', { exact: true }).selectOption(budget.id)
      await expect(page.getByLabel('Equipo', { exact: true })).toHaveValue(`Grúa histórica ${marca}`)
      await expect(page.getByText(fileName, { exact: true })).toBeVisible()
      if (uploadState === 'pending') {
        await expect(submit).toBeDisabled()
        await expect(page.getByRole('progressbar', { name: `Subiendo ${fileName}`, exact: true })).toBeVisible()
        releaseUpload()
      }
      await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
      await expect(submit).toBeEnabled()
      await submit.click()
      await expect(page).toHaveURL(new RegExp(`/presupuestos/${budget.id}$`))
      await expect(page.getByRole('link', { name: fileName, exact: true })).toBeVisible()
      const saved = await withBase(async (db) => (await db.query<{ nombre_original: string; equipo_id: string }>(
        `select a.nombre_original, d.equipo_id from public.documentos d
         join public.documento_presupuestos dp on dp.documento_id = d.id
         join public.documento_archivos a on a.documento_id = d.id where dp.cotizacion_id = $1`,
        [budget.id],
      )).rows)
      expect(saved).toEqual([{ nombre_original: fileName, equipo_id: historicEquipmentId }])
    } finally {
      releaseUpload()
    }
  })
}
