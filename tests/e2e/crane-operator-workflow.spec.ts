import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createOperatorFixture, type OperatorTestUser } from './crane-operator-fixture'
import { withBase } from './database'

test.describe.configure({ mode: 'parallel' })

async function login(page: Page, account: OperatorTestUser, heading: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
}

async function selectLinkBudget(page: Page, budgetId: string) {
  const options = page.locator('#link-budget option')
  const target = page.locator(`#link-budget option[value="${budgetId}"]`)
  const maxAdditionalPages = 40
  for (let pageIndex = 0; pageIndex < maxAdditionalPages && !await target.count(); pageIndex++) {
    const previousCount = await options.count()
    await page.getByRole('button', { name: 'Cargar más presupuestos', exact: true }).click()
    await expect(options).not.toHaveCount(previousCount)
  }
  await expect(target, 'El presupuesto propio debe estar disponible para vincular').toHaveCount(1)
  await page.getByLabel('Presupuesto', { exact: true }).selectOption(budgetId)
}

async function expectOriginalDownload(page: Page, href: string, original: Buffer) {
  const response = await page.request.get(href)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(await response.body()).toEqual(original)
}

for (const withBudget of [true, false]) {
  const scenario = withBudget ? 'con presupuesto seleccionado' : 'sin presupuesto y con vinculación posterior'
  test(`alta de gruista → envío móvil ${scenario} → documento persistido`, async ({ page, browser }) => {
    test.setTimeout(120_000)
    const fixture = createOperatorFixture()
    let mobileContext: BrowserContext | undefined
    try {
      const { staff, crane, customerId, budget } = await test.step('Preparar personal, grúa y presupuesto propios', async () => {
        const staff = await fixture.user('operador', 'personal-flujo')
        const crane = await fixture.equipment('flujo completo')
        const customerId = await fixture.customer()
        const budget = await fixture.budget(crane.id, 'en_curso', `Trabajo ${fixture.marker}`)
        return { staff, crane, customerId, budget }
      })
      const worker: OperatorTestUser = {
        id: '',
        email: `${fixture.marker}-alta-flujo@example.test`,
        password: `Flujo!${crypto.randomUUID()}`,
        name: `Gruista ${fixture.marker}`,
      }
      fixture.trackCreatedAccount(worker.email)
      const number = `R-${fixture.marker}`
      const serviceDate = '2026-11-01'
      const workDescription = `Izaje y montaje ${fixture.marker}`
      const fileName = `Remito ${fixture.marker}.pdf`
      const originalFile = Buffer.from(`%PDF-1.4\nRemito ${fixture.marker}\n%%EOF`)

      await test.step('Crear el gruista desde el formulario del personal', async () => {
        await login(page, staff, 'Inicio')
        await page.goto('/crane-operators/new')
        await expect(page.getByRole('heading', { name: 'Nuevo gruista', exact: true })).toBeVisible()
        await expect(page.getByLabel('Rol', { exact: true })).toHaveCount(0)
        await page.getByLabel('Nombre', { exact: true }).fill(worker.name)
        await page.getByLabel('Email', { exact: true }).fill(worker.email)
        await page.getByLabel('Contraseña', { exact: true }).fill(worker.password)
        await page.getByLabel('Grúa asignada', { exact: true }).selectOption(crane.id)
        await page.getByRole('button', { name: 'Crear gruista', exact: true }).click()
        await expect(page).toHaveURL(/\/crane-operators\/[0-9a-f-]{36}$/)
        worker.id = page.url().split('/').at(-1)!
        const profile = await withBase(async (db) => (await db.query(
          `select p.rol,p.activo,a.equipment_id,a.assigned_by from public.profiles p
           join public.crane_operator_assignments a on a.user_id=p.id where p.id=$1`, [worker.id],
        )).rows[0])
        expect(profile).toEqual({ rol: 'crane_operator', activo: true, equipment_id: crane.id, assigned_by: staff.id })
      })

      const mobilePage = await test.step('Ingresar con la cuenta recién creada en un contexto móvil independiente', async () => {
        mobileContext = await browser.newContext({
          viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
          locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires',
        })
        const mobilePage = await mobileContext.newPage()
        await login(mobilePage, worker, 'Mis remitos')
        return mobilePage
      })

      const noteId = await test.step('Enviar el remito y su PDF desde el formulario móvil', async () => {
        await mobilePage.goto('/operator/new')
        const budgetSelect = mobilePage.getByLabel('Presupuesto (opcional)', { exact: true })
        await expect(budgetSelect).toHaveValue('')
        if (withBudget) {
          await budgetSelect.selectOption(budget.id)
          await expect(mobilePage.getByText('Cliente y lugar del presupuesto', { exact: true })).toBeVisible()
        } else {
          await expect(budgetSelect.locator('option:checked')).toHaveText('Trabajo sin presupuesto')
          await mobilePage.getByLabel('Cliente o lugar del trabajo', { exact: true }).fill(`Obra ${fixture.marker}`)
        }
        await mobilePage.getByLabel('Fecha del servicio', { exact: true }).fill(serviceDate)
        await mobilePage.getByLabel('Número de remito (opcional)', { exact: true }).fill(number)
        await mobilePage.getByLabel('Descripción del trabajo', { exact: true }).fill(workDescription)
        const fileChooser = mobilePage.waitForEvent('filechooser')
        await mobilePage.getByRole('button', { name: 'Seleccionar archivos', exact: true }).click()
        await (await fileChooser).setFiles({ name: fileName, mimeType: 'application/pdf', buffer: originalFile })
        await expect(mobilePage.getByText('Listo para guardar', { exact: true })).toBeVisible()
        await test.step('Conservar el ancho móvil al mostrar un nombre de archivo largo', async () => {
          const layout = await mobilePage.getByText('Listo para guardar', { exact: true }).evaluate((status) => {
            const card = status.closest('li')!
            const list = card.parentElement!
            return {
              viewportWidth: window.innerWidth,
              visualViewportWidth: window.visualViewport!.width,
              documentWidth: document.documentElement.scrollWidth,
              uploadWidth: list.parentElement!.getBoundingClientRect().width,
              listWidth: list.getBoundingClientRect().width,
              cardWidth: card.getBoundingClientRect().width,
            }
          })
          await test.info().attach('ancho-adjunto-movil', { body: JSON.stringify(layout, null, 2), contentType: 'application/json' })
          expect(layout.documentWidth).toBeLessThanOrEqual(390)
          expect(layout.viewportWidth).toBe(390)
          expect(layout.visualViewportWidth).toBe(390)
          expect(layout.cardWidth).toBeLessThanOrEqual(layout.uploadWidth)
        })
        await mobilePage.getByRole('button', { name: 'Enviar remito', exact: true }).click()
        await expect(mobilePage).toHaveURL(/\/operator\/notes\/[0-9a-f-]{36}$/)
        await expect(mobilePage.getByText(withBudget ? 'Vinculado' : 'Pendiente de vincular', { exact: true })).toBeVisible()
        return mobilePage.url().split('/').at(-1)!
      })

      const fileId = await test.step('Revisar la actividad y descargar el archivo original como personal', async () => {
        await page.goto(`/crane-operators/${worker.id}`)
        const activity = page.locator('table:visible').getByRole('row').filter({ hasText: number })
        await expect(activity).toHaveCount(1)
        await expect(activity).toContainText(crane.name)
        await expect(activity).toContainText(workDescription)
        await expect(activity).toContainText('Servicio: 01/11/2026')
        await expect(activity.getByText(withBudget ? 'Vinculado' : 'Pendiente de vincular', { exact: true })).toBeVisible()
        await activity.getByRole('link', { name: number, exact: true }).click()
        await expect(page).toHaveURL(`/delivery-notes/${noteId}`)
        const fileLink = page.getByRole('link', { name: fileName, exact: true })
        await expect(fileLink).toBeVisible()
        const fileHref = await fileLink.getAttribute('href')
        expect(fileHref).toMatch(/^\/delivery-notes\/files\/[0-9a-f-]{36}$/)
        await expectOriginalDownload(page, fileHref!, originalFile)
        return fileHref!.split('/').at(-1)!
      })

      await test.step(withBudget ? 'Confirmar la vinculación automática al presupuesto propio' : 'Vincular el remito pendiente al presupuesto propio desde la UI', async () => {
        if (withBudget) {
          await expect(page.getByRole('button', { name: 'Vincular remito', exact: true })).toHaveCount(0)
        } else {
          const pending = await withBase(async (db) => (await db.query(
            'select status,document_id,linked_budget_id from public.crane_delivery_notes where id=$1', [noteId],
          )).rows[0])
          expect(pending).toEqual({ status: 'pending', document_id: null, linked_budget_id: null })
          await selectLinkBudget(page, budget.id)
          await page.getByRole('button', { name: 'Vincular remito', exact: true }).click()
        }
        await expect(page.getByText('Vinculado', { exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Ver presupuesto vinculado', exact: true })).toHaveAttribute('href', `/presupuestos/${budget.id}`)
      })

      await test.step('Recargar actividad, portal y detalle para comprobar el estado persistido', async () => {
        await page.goto(`/crane-operators/${worker.id}`)
        await page.reload()
        const activity = page.locator('table:visible').getByRole('row').filter({ hasText: number })
        await expect(activity).toHaveCount(1)
        await expect(activity.getByText('Vinculado', { exact: true })).toBeVisible()
        await expect(activity).toContainText(crane.name)
        await mobilePage.reload()
        await expect(mobilePage.getByText('Vinculado', { exact: true })).toBeVisible()
        await expect(mobilePage.getByText(crane.name, { exact: true })).toBeVisible()
        await expect(mobilePage.getByText('01/11/2026', { exact: true })).toBeVisible()
        await expect(mobilePage.getByText(workDescription, { exact: true })).toBeVisible()
        await expect(mobilePage.getByRole('link', { name: fileName, exact: true })).toBeVisible()
        await expectOriginalDownload(mobilePage, `/operator/files/${fileId}`, originalFile)
        await mobilePage.goto('/operator')
        await mobilePage.reload()
        const history = mobilePage.locator('ul:visible > li').filter({ has: mobilePage.getByRole('link', { name: `Remito ${number}`, exact: true }) })
        await expect(history).toHaveCount(1)
        await expect(history.getByText('Vinculado', { exact: true })).toBeVisible()
        await history.getByRole('link', { name: `Remito ${number}`, exact: true }).click()
        await expect(mobilePage).toHaveURL(`/operator/notes/${noteId}`)
        await expect(mobilePage.getByText('Vinculado', { exact: true })).toBeVisible()
      })

      await test.step('Verificar un único documento oficial y sus datos y bytes originales en el presupuesto', async () => {
        const note = await withBase(async (db) => (await db.query(
          `select operator_id,equipment_id,service_date::text,status,requested_budget_id,linked_budget_id,document_id
           from public.crane_delivery_notes where id=$1`, [noteId],
        )).rows[0])
        expect(note).toMatchObject({
          operator_id: worker.id, equipment_id: crane.id, service_date: serviceDate, status: 'linked',
          requested_budget_id: withBudget ? budget.id : null, linked_budget_id: budget.id,
        })
        const documents = await withBase(async (db) => (await db.query(
          `select d.id,d.created_by,d.equipo_id,d.fecha::text,p.cotizacion_id from public.documentos d
           left join public.documento_presupuestos p on p.documento_id=d.id
           where d.cliente_id=$1 and d.tipo='remito' and d.numero=$2`, [customerId, number],
        )).rows)
        expect(documents).toEqual([{
          id: note.document_id, created_by: worker.id, equipo_id: crane.id, fecha: serviceDate, cotizacion_id: budget.id,
        }])
        await page.goto(`/presupuestos/${budget.id}`)
        await expect(page.getByRole('heading', { name: `Presupuesto N° ${budget.numero}`, exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Remitos · 1', exact: true })).toBeVisible()
        const document = page.locator(`[data-documento="${note.document_id}"]`)
        await expect(document).toHaveCount(1)
        await expect(document.getByRole('link', { name: number, exact: true })).toHaveAttribute('href', `/documentos/${note.document_id}`)
        const officialFile = document.getByRole('link', { name: fileName, exact: true })
        await expect(officialFile).toBeVisible()
        await expectOriginalDownload(page, (await officialFile.getAttribute('href'))!, originalFile)
        await expectOriginalDownload(page, `/delivery-notes/files/${fileId}`, originalFile)
      })
    } finally {
      try {
        await mobileContext?.close()
      } finally {
        await fixture.cleanup()
      }
    }
  })
}
