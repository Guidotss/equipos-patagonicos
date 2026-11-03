import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/supabase/database.types'
import { createOperatorFixture, type OperatorTestUser } from './crane-operator-fixture'
import { withBase } from './database'
import { iniciarSession } from './helpers'

const fixture = createOperatorFixture()
let worker: OperatorTestUser
let other: OperatorTestUser
let unassigned: OperatorTestUser
let inactive: OperatorTestUser
let staff: OperatorTestUser
let crane: { id: string; name: string }
let replacement: { id: string; name: string }
let ownBudget: { id: string; numero: number }
let finalBudget: { id: string; numero: number }
let noteId: string
let fileId: string
let accessRequest: Request

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  worker = await fixture.user('operador', 'gruista')
  other = await fixture.user('crane_operator', 'otro')
  unassigned = await fixture.user('crane_operator', 'sin-asignar')
  inactive = await fixture.user('crane_operator', 'inactivo', false)
  staff = await fixture.user('operador', 'administracion')
  crane = await fixture.equipment('principal')
  replacement = await fixture.equipment('reemplazo')
  await fixture.assign(other.id, crane.id)
  await fixture.customer()
  finalBudget = await fixture.budget(null, 'finalizado', 'Trabajo finalizado sin grúa')
  for (let index = 0; index < 27; index++) await fixture.budget(null, 'finalizado', `Otro trabajo ${index}`)
  ownBudget = await fixture.budget(crane.id, 'en_curso', 'Trabajo asignado al gruista')
})
test.afterAll(() => fixture.cleanup())

async function login(page: Page, account: OperatorTestUser, heading = 'Mis remitos') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
}

async function capture(page: Page, info: TestInfo, name: string, review = name) {
  await mkdir(path.resolve('.impeccable/review'), { recursive: true })
  for (const [label, width, height] of [['desktop', 1200, 805], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => window.scrollY === 0 && document.fonts.status === 'loaded')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const fullPage of [false, true]) {
      const destination = info.outputPath(`${name}-${label}-${fullPage ? 'full' : 'first'}.png`)
      await page.screenshot({ path: destination, fullPage })
      if (fullPage || name === 'form') await cp(destination, path.resolve('.impeccable/review', `${review}-${label}${fullPage ? '' : '-first'}.png`))
    }
    if (name === 'form') await cp(info.outputPath(`form-${label}-full.png`), path.resolve('.impeccable/review', `${label}.png`))
  }
  if (name === 'form') {
    await page.setViewportSize({ width: 390, height: 780 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: info.outputPath('form-mobile-reference.png'), fullPage: true })
  }
}

async function attach(page: Page, withPhoto = false) {
  const files = [{ name: 'Remito de obra.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nRemito E2E\n%%EOF') }]
  if (withPhoto) {
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 2200; canvas.height = 1600
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#222222'; context.font = '60px sans-serif'; context.fillText('Remito de prueba', 80, 120)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    files.push({ name: 'Foto del remito.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') })
  }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Seleccionar archivos', exact: true }).click()
  await (await chooser).setFiles(files)
  await expect(page.getByText('Listo para guardar', { exact: true })).toHaveCount(files.length)
}

async function fillWork(page: Page, number: string) {
  await page.getByLabel('Número de remito (opcional)', { exact: true }).fill(number)
  await page.getByLabel('Fecha del servicio', { exact: true }).fill('2026-01-15')
  await page.getByLabel('Cliente o lugar del trabajo', { exact: true }).fill('Obra de montaje en Neuquén')
  await page.getByLabel('Descripción del trabajo', { exact: true }).fill('Izaje de estructura metálica')
  await page.getByLabel('Observaciones (opcional)', { exact: true }).fill('Trabajo finalizado sin incidentes')
}

async function replayAs(page: Page, original: Request) {
  const headers = original.headers()
  return page.request.post(new URL(original.url()).pathname, { headers: { 'next-action': headers['next-action'], 'content-type': headers['content-type'], origin: new URL(original.url()).origin }, data: original.postData()!, maxRedirects: 0 })
}

test('administrador asigna una grúa a una cuenta existente', async ({ page }, info) => {
  await iniciarSession(page)
  await page.goto('/configuracion')
  await page.getByRole('link', { name: /Usuarios y grúas/ }).click()
  const form = page.getByRole('form', { name: `Acceso de ${worker.email}` })
  await form.getByLabel('Rol', { exact: true }).selectOption('crane_operator')
  await form.getByLabel('Grúa asignada', { exact: true }).selectOption(crane.id)
  const request = page.waitForRequest((request) => request.method() === 'POST' && Boolean(request.headers()['next-action']))
  await form.getByRole('button', { name: 'Guardar acceso', exact: true }).click()
  accessRequest = await request
  await expect(form.getByLabel('Rol', { exact: true })).toHaveValue('crane_operator')
  await expect.poll(() => withBase(async (db) => (await db.query('select equipment_id from public.crane_operator_assignments where user_id=$1', [worker.id])).rows[0]?.equipment_id)).toBe(crane.id)
  await capture(page, info, 'users')
})

test('gruista móvil envía PDF y foto sin presupuesto, conserva errores e historial propio', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, worker)
  await page.goto('/operator?page=9999')
  await expect(page).toHaveURL(/\/operator$/)
  await expect(page.getByText('Todavía no cargaste remitos. Los envíos aparecerán acá.', { exact: true })).toBeVisible()
  await expect(page.getByRole('search')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Presupuestos', exact: true })).toHaveCount(0)
  await capture(page, info, 'home')
  await page.getByRole('link', { name: 'Cargar remito', exact: true }).click()
  await expect(page.getByLabel('Presupuesto (opcional)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Tomar foto del documento', { exact: true })).toHaveAttribute('capture', 'environment')
  await capture(page, info, 'form')
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page.getByLabel('Cliente o lugar del trabajo', { exact: true })).toBeFocused()
  await fillWork(page, `R-${fixture.marker}`)
  let interrupted = false
  await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
    if (route.request().method() === 'PUT' && !interrupted) { interrupted = true; await route.abort('internetdisconnected') }
    else await route.continue()
  })
  const photo = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10; return canvas.toDataURL('image/png').split(',')[1] })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Seleccionar archivos', exact: true }).click()
  await (await chooser).setFiles([{ name: 'Remito de obra.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nRemito E2E\n%%EOF') }, { name: 'Foto del remito.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') }])
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar remito', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByText('Listo para guardar', { exact: true })).toHaveCount(2)
  let failedSubmit = false
  let failedBody: string | null = null
  await page.route('**/operator/new', async (route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action'] && !failedSubmit) {
      failedSubmit = true; failedBody = route.request().postData(); await route.abort('internetdisconnected')
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page.getByText('Se interrumpió el envío. Reintentá sin volver a cargar los archivos.')).toBeVisible()
  await expect(page.getByLabel('Descripción del trabajo', { exact: true })).toHaveValue('Izaje de estructura metálica')
  await expect(page.getByText('Listo para guardar', { exact: true })).toHaveCount(2)
  const retry = page.waitForRequest((request) => request.method() === 'POST' && Boolean(request.headers()['next-action']))
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  expect((await retry).postData()).toBe(failedBody)
  await expect(page).toHaveURL(/\/operator\/notes\/[0-9a-f-]{36}$/)
  noteId = page.url().split('/').at(-1)!
  await expect(page.getByText('Pendiente de vincular', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Remito de obra.pdf', exact: true })).toBeVisible()
  const stored = await withBase(async (db) => (await db.query<{ id: string; mime: string; size: string }>('select id,mime,size from public.crane_delivery_note_files where note_id=$1 order by position', [noteId])).rows)
  fileId = stored[0].id
  expect(stored).toHaveLength(2)
  expect(stored[1].mime).toBe('image/jpeg')
  expect(Number(stored[1].size)).toBeGreaterThan(0)
  const download = await page.request.get(`/operator/files/${fileId}`)
  expect(download.ok()).toBe(true)
  expect((await download.body()).toString()).toContain('%PDF-1.4')
  await capture(page, info, 'operator-detail')
  await page.goto('/operator?page=9999')
  await expect(page).toHaveURL(/\/operator$/)
  await expect(page.getByRole('link', { name: new RegExp(`Remito R-${fixture.marker}`) })).toBeVisible()
})

test('otro gruista no puede acceder al remito, sus archivos ni gestión comercial', async ({ page }) => {
  await login(page, other)
  await expect(page.getByText(`R-${fixture.marker}`, { exact: true })).toHaveCount(0)
  await expect(page.locator(`a[href="/operator/notes/${noteId}"]`)).toHaveCount(0)
  expect((await page.request.get(`/operator/notes/${noteId}`)).status()).toBe(404)
  expect((await page.request.get(`/operator/files/${fileId}`)).status()).toBe(404)
  expect((await page.request.get('/operator/files/no-es-uuid')).status()).toBe(404)
  for (const destination of ['/clientes', '/cotizaciones', '/presupuestos', '/buscar?q=obra', '/configuracion', '/configuracion/users', '/delivery-notes', `/documentos/nuevo?presupuesto=${ownBudget.id}`]) {
    await page.goto(destination)
    await expect(page).toHaveURL(/\/operator$/)
    await expect(page.getByRole('heading', { name: 'Mis remitos', exact: true })).toBeVisible()
  }
  expect((await page.request.get(`/cotizaciones/${ownBudget.id}/pdf`)).status()).toBe(403)
  expect((await page.request.post('/cotizaciones/vista-previa', { data: { estado: {} } })).status()).toBe(403)
  const response = await replayAs(page, accessRequest)
  expect(response.headers()['x-action-redirect']).toContain('/operator')
  await expect.poll(() => withBase(async (db) => (await db.query('select rol from public.profiles where id=$1', [other.id])).rows[0].rol)).toBe('crane_operator')
})

test('administración descarga pendiente y lo vincula a presupuesto finalizado sin grúa más allá de la primera página', async ({ page, browser }, info) => {
  test.setTimeout(120_000)
  await login(page, staff, 'Inicio')
  await page.goto('/configuracion')
  await expect(page.getByRole('link', { name: /Usuarios y grúas/ })).toHaveCount(0)
  await page.goto('/configuracion/users')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/delivery-notes?status=pending&page=9999')
  await expect(page).toHaveURL(/\/delivery-notes\?status=pending$/)
  await expect(page.getByRole('heading', { name: 'Remitos', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`^(Remito )?R-${fixture.marker}$`) })).toBeVisible()
  await capture(page, info, 'inbox')
  await page.goto(`/delivery-notes/${noteId}`)
  await expect(page.getByRole('link', { name: 'Remito de obra.pdf', exact: true })).toBeVisible()
  const download = await page.request.get(`/delivery-notes/files/${fileId}`)
  expect(download.ok()).toBe(true)
  expect((await download.body()).toString()).toContain('%PDF-1.4')
  expect((await page.request.get('/delivery-notes/files/no-es-uuid')).status()).toBe(404)
  const option = page.locator(`#link-budget option[value="${finalBudget.id}"]`)
  expect(await option.count()).toBe(0)
  while (!await option.count()) {
    await page.getByRole('button', { name: 'Cargar más presupuestos', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cargando…', exact: true })).toHaveCount(0)
  }
  await page.getByLabel('Presupuesto', { exact: true }).selectOption(finalBudget.id)
  await capture(page, info, 'pending-detail')
  let failed = false
  await page.route(`**/delivery-notes/${noteId}`, async (route) => {
    if (route.request().method() === 'POST' && !failed) { failed = true; await route.abort('internetdisconnected') }
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Vincular remito', exact: true }).click()
  await expect(page.getByText('Se interrumpió la operación. Reintentá con el presupuesto seleccionado.')).toBeVisible()
  await expect(page.getByLabel('Presupuesto', { exact: true })).toHaveValue(finalBudget.id)
  await page.getByRole('button', { name: 'Vincular remito', exact: true }).click()
  await expect(page.getByText('Vinculado', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver presupuesto vinculado', exact: true })).toHaveAttribute('href', `/presupuestos/${finalBudget.id}`)
  const official = await withBase(async (db) => (await db.query(`select d.id,d.numero,d.fecha,d.created_by,d.equipo_id,d.monto,n.document_id,n.linked_budget_id from public.documentos d join public.crane_delivery_notes n on n.document_id=d.id where n.id=$1`, [noteId])).rows[0])
  expect(official).toMatchObject({ numero: `R-${fixture.marker}`, created_by: worker.id, equipo_id: crane.id, monto: null, linked_budget_id: finalBudget.id })
  expect(new Date(official.fecha).toISOString().slice(0, 10)).toBe('2026-01-15')
  const preservation = await withBase(async (db) => (await db.query('select a.path,a.nombre_original from public.documento_archivos a where a.documento_id=$1 order by a.orden', [official.id])).rows)
  expect(preservation.map((file) => file.nombre_original)).toEqual(['Remito de obra.pdf', 'Foto del remito.png'])
  expect(preservation.every((file) => file.path.startsWith(`documentos/crane-operators/${worker.id}/`))).toBe(true)
  await capture(page, info, 'staff-detail')
  await page.goto('/delivery-notes?status=pending&page=9999')
  await expect(page).toHaveURL(/\/delivery-notes\?status=pending$/)
  // Otros escenarios pueden tener remitos pendientes en esta bandeja compartida.
  await expect(page.locator(`a[href="/delivery-notes/${noteId}"]`)).toHaveCount(0)
  await page.goto('/delivery-notes?status=linked&page=9999')
  await expect(page).toHaveURL(/\/delivery-notes\?status=linked$/)
  await expect(page.getByRole('link', { name: new RegExp(`^(Remito )?R-${fixture.marker}$`) })).toBeVisible()

  const workerContext = await browser.newContext()
  try {
    const workerPage = await workerContext.newPage()
    await login(workerPage, worker)
    await workerPage.goto(`/operator/notes/${noteId}`)
    await expect(workerPage.getByText('Vinculado', { exact: true })).toBeVisible()
    await expect(workerPage.getByRole('link', { name: /presupuesto/ })).toHaveCount(0)
    await page.goto(`/documentos/nuevo?presupuesto=${ownBudget.id}`)
    const action = page.waitForRequest((request) => request.method() === 'POST' && Boolean(request.headers()['next-action']))
    await attach(page)
    const denied = await replayAs(workerPage, await action)
    expect(denied.headers()['x-action-redirect']).toContain('/operator')
  } finally { await workerContext.close() }
})

test('presupuesto propio aprobado vincula automáticamente y no ofrece presupuestos ajenos', async ({ page }) => {
  await login(page, worker)
  await page.goto('/operator/new')
  await expect(page.locator('#budgetId option')).toHaveCount(2)
  await page.getByLabel('Presupuesto (opcional)', { exact: true }).selectOption(ownBudget.id)
  await expect(page.getByLabel('Cliente o lugar del trabajo', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Cliente y lugar del presupuesto', { exact: true })).toBeVisible()
  await page.getByLabel('Descripción del trabajo', { exact: true }).fill('Trabajo del presupuesto asignado')
  await attach(page)
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/notes\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Vinculado', { exact: true })).toBeVisible()
  const linkedId = page.url().split('/').at(-1)!
  expect(await withBase(async (db) => (await db.query('select linked_budget_id from public.crane_delivery_notes where id=$1', [linkedId])).rows[0].linked_budget_id)).toBe(ownBudget.id)
})

test('sin asignación, equipo inactivo y usuario inactivo explican el acceso disponible', async ({ page }) => {
  await login(page, unassigned)
  await expect(page.getByText(/Todavía no tenés una grúa asignada/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cargar remito', exact: true })).toHaveCount(0)
  await page.goto('/operator/new')
  await expect(page.getByRole('button', { name: 'Enviar remito', exact: true })).toBeDisabled()
  await page.context().clearCookies()
  await withBase((db) => db.query('update public.equipos set activo=false where id=$1', [crane.id]))
  try {
    await login(page, worker)
    await expect(page.getByText(/Tu grúa asignada está inactiva/)).toBeVisible()
    await expect(page.getByText(`R-${fixture.marker}`, { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cargar remito', exact: true })).toHaveCount(0)
    await page.context().clearCookies()
    await login(page, inactive, 'Tu usuario todavía no está habilitado')
    expect((await page.request.get(`/cotizaciones/${ownBudget.id}/pdf`)).status()).toBe(401)
    expect((await page.request.post('/cotizaciones/vista-previa', { data: {} })).status()).toBe(401)
  } finally { await withBase((db) => db.query('update public.equipos set activo=true where id=$1', [crane.id])) }
})

test('reasignación rechaza archivos anteriores y conserva el historial de la grúa original', async ({ page }) => {
  await login(page, worker)
  await page.goto('/operator/new')
  await fillWork(page, 'R-REASIGNACION')
  await attach(page)
  await fixture.assign(worker.id, replacement.id)
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page.getByText('La carga no te pertenece, venció o ya se utilizó', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Número de remito (opcional)', { exact: true })).toHaveValue('R-REASIGNACION')
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
  expect(await withBase(async (db) => (await db.query('select id from public.crane_delivery_notes where operator_id=$1 and number=$2', [worker.id, 'R-REASIGNACION'])).rowCount)).toBe(0)
  await page.goto('/operator')
  await expect(page.getByText(replacement.name, { exact: true }).first()).toBeVisible()
  await page.goto(`/operator/notes/${noteId}`)
  await expect(page.getByText(crane.name, { exact: true })).toBeVisible()
  expect((await page.request.get(`/operator/files/${fileId}`)).ok()).toBe(true)

  await page.goto('/operator/new')
  const duringUploadNumber = `R-CARGA-${fixture.marker}`
  await fillWork(page, duringUploadNumber)
  let changed = false
  await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
    if (route.request().method() === 'PUT' && !changed) { changed = true; await fixture.assign(worker.id, crane.id) }
    await route.continue()
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Seleccionar archivos', exact: true }).click()
  await (await chooser).setFiles({ name: 'Reasignado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') })
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
  expect(changed).toBe(true)
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page.getByText('La carga no te pertenece, venció o ya se utilizó', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Número de remito (opcional)', { exact: true })).toHaveValue(duringUploadNumber)
  await expect(page.getByText('Listo para guardar', { exact: true })).toBeVisible()
  expect(await withBase(async (db) => (await db.query('select id from public.crane_delivery_notes where operator_id=$1 and number=$2', [worker.id, duringUploadNumber])).rowCount)).toBe(0)
})


test('el personal edita el remito completo y conserva su historial cuando se elimina el presupuesto original', async ({ page, browser }, info) => {
  test.setTimeout(120_000)
  const imported = await fixture.budget(crane.id, 'en_curso', 'Trabajo importado con remito completo', 'importada')
  await fixture.assign(worker.id, crane.id)
  const number = 'N'.repeat(100)
  const work = 'Trabajo de izaje. '.repeat(120).slice(0, 1999) + 'X'
  const notes = 'Observación del gruista. '.repeat(100).slice(0, 1999) + 'X'
  await login(page, worker)
  await page.goto('/operator/new')
  await page.getByLabel('Presupuesto (opcional)', { exact: true }).selectOption(imported.id)
  await page.getByLabel('Número de remito (opcional)', { exact: true }).fill(number)
  await page.getByLabel('Fecha del servicio', { exact: true }).fill('2026-01-15')
  await page.getByLabel('Descripción del trabajo', { exact: true }).fill(work)
  await page.getByLabel('Observaciones (opcional)', { exact: true }).fill(notes)
  await attach(page)
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/notes\/[0-9a-f-]{36}$/)
  const submittedId = page.url().split('/').at(-1)!
  await expect(page.getByText('Vinculado', { exact: true })).toBeVisible()
  const original = await withBase(async (db) => (await db.query<{ id: string; numero: string; notas: string }>(
    'select d.id,d.numero,d.notas from public.documentos d join public.crane_delivery_notes n on n.document_id=d.id where n.id=$1', [submittedId])).rows[0])
  expect(original.numero).toBe(number)
  expect(original.notas).toContain(work)
  expect(original.notas).toContain(notes)
  expect(original.notas.length).toBeGreaterThan(4000)

  const staffContext = await browser.newContext()
  try {
    const staffPage = await staffContext.newPage()
    await login(staffPage, staff, 'Inicio')
    await staffPage.goto(`/documentos/${original.id}`)
    await expect(staffPage.getByLabel('Número (opcional)', { exact: true })).toHaveValue(number)
    await expect(staffPage.getByLabel('Notas (opcional)', { exact: true })).toHaveValue(original.notas)
    await expect(staffPage.getByLabel('Número (opcional)', { exact: true })).toHaveAttribute('maxlength', '200')
    await expect(staffPage.getByLabel('Notas (opcional)', { exact: true })).toHaveAttribute('maxlength', '12400')
    const serviceDate = staffPage.getByLabel('Fecha (opcional)', { exact: true })
    await expect(serviceDate).toBeEnabled()
    await serviceDate.fill('2026-02-20')
    await staffPage.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(staffPage).toHaveURL(new RegExp(`/presupuestos/${imported.id}$`))
    const saved = await withBase(async (db) => (await db.query('select numero,notas,fecha::text from public.documentos where id=$1', [original.id])).rows[0])
    expect(saved).toEqual({ numero: number, notas: original.notas, fecha: '2026-02-20' })

    const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    expect((await client.auth.signInWithPassword({ email: staff.email, password: staff.password })).error).toBeNull()
    expect((await client.rpc('anular_documento', { p_id: original.id })).error).toBeNull()
    expect((await client.rpc('revertir_aprobacion', { p_id: imported.id })).error).toBeNull()
    expect((await client.rpc('borrar_cotizacion', { p_id: imported.id })).error).toBeNull()
    await staffPage.goto(`/delivery-notes/${submittedId}`)
    await expect(staffPage.getByText('El presupuesto original ya no está disponible.', { exact: true })).toBeVisible()
    await expect(staffPage.getByRole('link', { name: 'Ver presupuesto vinculado', exact: true })).toHaveCount(0)
    await expect(staffPage.getByRole('link', { name: 'Ver documento', exact: true })).toHaveAttribute('href', `/documentos/${original.id}`)
    await expect(staffPage.getByText('Vinculado', { exact: true })).toBeVisible()
    await capture(staffPage, info, 'deleted-budget')
    await page.reload()
    await expect(page.getByText('Vinculado', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Remito de obra.pdf', exact: true })).toBeVisible()
  } finally {
    await staffContext.close()
  }
})
