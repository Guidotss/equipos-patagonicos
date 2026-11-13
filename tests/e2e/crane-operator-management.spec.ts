import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  expect,
  test,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createOperatorFixture,
  type OperatorTestUser,
} from './crane-operator-fixture'
import { withBase } from './database'

const fixture = createOperatorFixture()
const directoryHref = `/crane-operators?q=${encodeURIComponent(fixture.marker)}`
const worker = {
  email: `${fixture.marker}-alta@example.test`,
  password: `Alta!${crypto.randomUUID()}`,
  name: 'Lucía Fernández',
  id: '',
}
let staff: OperatorTestUser
let otherStaff: OperatorTestUser
let admin: OperatorTestUser
let crane: { id: string; name: string }
let replacement: { id: string; name: string }
let createRequest: Request
let accessRequest: Request
let firstNoteId: string
let latestNoteId: string

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  staff = await fixture.user('operador', 'personal')
  otherStaff = await fixture.user('operador', 'segundo-personal')
  admin = await fixture.user('admin', 'administrador')
  crane = await fixture.equipment('XCMG 70 TN')
  replacement = await fixture.equipment('Liebherr 90 TN')
  fixture.trackCreatedAccount(worker.email)
})
test.afterAll(() => fixture.cleanup())

async function login(
  page: Page,
  account: OperatorTestUser,
  heading = 'Inicio',
) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: heading, exact: true }),
  ).toBeVisible()
}

async function logout(page: Page, account: OperatorTestUser) {
  await page
    .getByRole('button', {
      name: `${account.name}, menú de usuario`,
      exact: true,
    })
    .click()
  await page
    .getByRole('menuitem', { name: 'Cerrar sesión', exact: true })
    .click()
  await expect(page).toHaveURL(/\/login$/)
}

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await mkdir(path.resolve('.impeccable/review'), { recursive: true })
  for (const [label, width, height] of [
    ['desktop', 1200, 805],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(
      () => window.scrollY === 0 && document.fonts.status === 'loaded',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    for (const fullPage of [false, true]) {
      const destination = info.outputPath(
        `${name}-${label}-${fullPage ? 'full' : 'first'}.png`,
      )
      await page.screenshot({
        path: destination,
        fullPage,
        animations: 'disabled',
        caret: 'initial',
      })
      await cp(
        destination,
        path.resolve(
          '.impeccable/review',
          `crane-management-${name}-${label}${fullPage ? '' : '-first'}.png`,
        ),
      )
    }
  }
  if (name === 'new') {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    )
    await page.waitForFunction(
      () =>
        Math.abs(
          window.innerHeight +
            window.scrollY -
            document.documentElement.scrollHeight,
        ) < 2,
    )
    expect(
      await page.getByLabel('Contraseña', { exact: true }).evaluate((input) => {
        const button = document.querySelector(
          'form[aria-label="Nuevo gruista"] button[type="submit"]',
        )!
        return (
          input.getBoundingClientRect().bottom <=
          button.getBoundingClientRect().top - 8
        )
      }),
    ).toBe(true)
    const destination = info.outputPath('new-mobile-bottom.png')
    await page.screenshot({
      path: destination,
      animations: 'disabled',
      caret: 'initial',
    })
    await cp(
      destination,
      path.resolve('.impeccable/review/crane-management-new-mobile-bottom.png'),
    )
  }
  await page.setViewportSize({ width: 1200, height: 805 })
}

async function assertActivityActionsFit(page: Page) {
  for (const width of [1024, 1200, 1280]) {
    await page.setViewportSize({ width, height: 805 })
    const links = page.locator('tbody a[aria-label^="Ver actividad de"]')
    await expect(links.first()).toBeVisible()
    await expect
      .poll(() =>
        links.evaluateAll(
          (items) =>
            items.length > 0 &&
            items.every((link) => {
              const frame = link.closest('[data-slot="table-container"]')!
              const bounds = frame.getBoundingClientRect()
              const action = link.getBoundingClientRect()
              return (
                action.left >= bounds.left &&
                action.right <= bounds.right &&
                action.height >= 44 &&
                frame.scrollWidth <= frame.clientWidth + 1
              )
            }),
        ),
      )
      .toBe(true)
  }
  await page.setViewportSize({ width: 1200, height: 805 })
}

async function fillAccount(page: Page, email = worker.email) {
  await page.getByLabel('Nombre', { exact: true }).fill(worker.name)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(worker.password)
}

async function submitNote(
  page: Page,
  craneName: string,
  number: string,
  serviceDate: string,
) {
  await page.getByRole('link', { name: craneName, exact: true }).click()
  await expect(page.getByText(craneName, { exact: true })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Datos opcionales' }).click()
  await page.getByLabel('Número de remito', { exact: true }).fill(number)
  await page.getByLabel('Fecha del servicio', { exact: true }).fill(serviceDate)
  await page
    .getByLabel('Cliente o lugar del trabajo', { exact: true })
    .fill('Obra de montaje en Neuquén')
  await page
    .getByLabel('Descripción del trabajo', { exact: true })
    .fill('Izaje de estructura metálica')
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: 'Seleccionar archivos', exact: true })
    .click()
  await (
    await chooser
  ).setFiles({
    name: 'Remito firmado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nRemito de prueba\n%%EOF'),
  })
  await expect(
    page.getByText('Listo para guardar', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Enviar remito', exact: true }).click()
  await expect(page).toHaveURL(/\/operator\/notes\/[0-9a-f-]{36}$/)
  await expect(
    page.getByText('Pendiente de vincular', { exact: true }),
  ).toBeVisible()
  return page.url().split('/').at(-1)!
}

async function replay(page: Page, original: Request, input?: object) {
  const headers = original.headers()
  return page.request.post(new URL(original.url()).pathname, {
    headers: {
      'next-action': headers['next-action'],
      'content-type': headers['content-type'],
      origin: new URL(original.url()).origin,
    },
    data: input ? JSON.stringify([input]) : original.postData()!,
    maxRedirects: 0,
  })
}

function actionRequest(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
  )
}

test('personal operador crea un gruista con validación, recuperación y contraseña privada', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  await login(page, staff)
  await page.getByRole('link', { name: 'Gruistas', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Gruistas', exact: true }),
  ).toBeVisible()
  await page.goto(directoryHref)
  await expect(
    page.getByText('No encontramos gruistas con estos filtros.', {
      exact: true,
    }),
  ).toBeVisible()
  await capture(page, info, 'list-empty')
  await page
    .getByRole('link', { name: 'Nuevo gruista', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Nuevo gruista', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
    'type',
    'password',
  )
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  )
  await expect(page.getByLabel('Rol', { exact: true })).toHaveCount(0)
  await capture(page, info, 'new')
  await page.getByLabel('Email', { exact: true }).fill('email-invalido')
  await page.getByLabel('Contraseña', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Crear gruista', exact: true }).click()
  await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused()
  await expect(
    page.getByText('Ingresá un email válido', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Grúa asignada', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    '123',
  )
  await fillAccount(page, staff.email)
  await page.getByRole('button', { name: 'Crear gruista', exact: true }).click()
  await expect(
    page.getByText('Ya existe una cuenta con ese email', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    worker.password,
  )
  const unchanged = await withBase(
    async (db) =>
      (
        await db.query('select rol,activo from public.profiles where id=$1', [
          staff.id,
        ])
      ).rows[0],
  )
  expect(unchanged).toEqual({ rol: 'operador', activo: true })
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  expect(
    (
      await auth.auth.signInWithPassword({
        email: staff.email,
        password: staff.password,
      })
    ).error,
  ).toBeNull()
  await auth.auth.signOut({ scope: 'local' })
  await page.getByLabel('Email', { exact: true }).fill(worker.email)
  let interrupted = false
  await page.route('**/crane-operators/new', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().headers()['next-action'] &&
      !interrupted
    ) {
      interrupted = true
      await route.abort('internetdisconnected')
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Crear gruista', exact: true }).click()
  await expect(page.getByText(/Se interrumpió el alta/)).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    worker.password,
  )
  expect(
    await withBase(
      async (db) =>
        (
          await db.query('select id from auth.users where email=$1', [
            worker.email,
          ])
        ).rowCount,
    ),
  ).toBe(0)
  let responseBody = ''
  await page.route('**/crane-operators/new', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    responseBody = (await response.body()).toString()
    await route.fulfill({ response })
  })
  const request = actionRequest(page)
  await page
    .getByRole('button', { name: 'Crear gruista', exact: true })
    .dblclick()
  createRequest = await request
  await expect(page).toHaveURL(/\/crane-operators\/[0-9a-f-]{36}$/)
  expect(responseBody).not.toBe('')
  expect(responseBody).not.toContain(worker.password)
  worker.id = page.url().split('/').at(-1)!
  expect(page.url()).not.toContain(worker.password)
  const profile = await withBase(
    async (db) =>
      (
        await db.query(
          'select p.rol,p.activo,a.equipment_id from public.profiles p left join public.crane_operator_assignments a on a.user_id=p.id where p.id=$1',
          [worker.id],
        )
      ).rows[0],
  )
  expect(profile).toEqual({
    rol: 'crane_operator',
    activo: true,
    equipment_id: null,
  })
  expect(
    await withBase(
      async (db) =>
        (
          await db.query('select id from auth.users where email=$1', [
            worker.email,
          ])
        ).rowCount,
    ),
  ).toBe(1)
  const injectedRole = await replay(page, createRequest, {
    name: worker.name,
    email: worker.email,
    password: worker.password,
    equipmentId: crane.id,
    role: 'admin',
    actorId: admin.id,
  })
  expect(await injectedRole.text()).toContain(
    'El alta contiene campos no permitidos',
  )
  const invalidInput = await replay(page, createRequest, {
    name: '',
    email: 'invalido',
    password: '123',
    equipmentId: 'invalida',
  })
  const invalidBody = await invalidInput.text()
  expect(invalidBody).toContain('Ingresá el nombre')
  expect(invalidBody).toContain('Ingresá un email válido')
  expect(invalidBody).not.toContain(worker.password)
  await expect(
    page.getByText(/Este gruista todavía no envió remitos/),
  ).toBeVisible()
  await capture(page, info, 'detail-empty')
  await page.goto(directoryHref)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText(staff.email, { exact: true })).toHaveCount(0)
  await assertActivityActionsFit(page)
  await capture(page, info, 'list')
  await logout(page, staff)
  await login(page, worker, 'Mis remitos')
  await expect(
    page.getByRole('link', { name: 'Gruistas', exact: true }),
  ).toHaveCount(0)
  const denied = await replay(page, createRequest)
  expect(denied.headers()['x-action-redirect']).toContain('/operator')
  for (const destination of [
    '/crane-operators',
    '/crane-operators/new',
    `/crane-operators/${worker.id}`,
  ]) {
    await page.goto(destination)
    await expect(page).toHaveURL(/\/operator$/)
  }
  firstNoteId = await submitNote(page, crane.name, 'R-PRIMERO', '2026-10-25')
})

test('actividad conserva la grúa de cada remito y ordena por envío', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000)
  await login(page, staff)
  await page.goto(`/crane-operators/${worker.id}`)
  await expect(
    page.locator(`a[href="/delivery-notes/${firstNoteId}"]`).first(),
  ).toBeVisible()
  await page.locator(`a[href="/delivery-notes/${firstNoteId}"]`).first().click()
  await expect(
    page.getByRole('link', { name: 'Remito firmado.pdf', exact: true }),
  ).toBeVisible()
  const fileId = await withBase(
    async (db) =>
      (
        await db.query(
          'select id from public.crane_delivery_note_files where note_id=$1',
          [firstNoteId],
        )
      ).rows[0].id,
  )
  expect((await page.request.get(`/delivery-notes/files/${fileId}`)).ok()).toBe(
    true,
  )
  await page.goto(`/crane-operators/${worker.id}`)
  await expect(page.getByLabel('Grúa asignada', { exact: true })).toHaveCount(0)
  const request = actionRequest(page)
  await page
    .getByRole('button', { name: 'Guardar acceso', exact: true })
    .click()
  accessRequest = await request
  await expect(
    page.getByText('Acceso actualizado.', { exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      withBase(
        async (db) =>
          (
            await db.query(
              'select equipment_id from public.crane_operator_assignments where user_id=$1',
              [worker.id],
            )
          ).rows[0]?.equipment_id,
      ),
    )
    .toBeUndefined()
  const workerContext = await browser.newContext()
  try {
    const workerPage = await workerContext.newPage()
    await login(workerPage, worker, 'Mis remitos')
    const denied = await replay(workerPage, accessRequest)
    expect(denied.headers()['x-action-redirect']).toContain('/operator')
    latestNoteId = await submitNote(
      workerPage,
      replacement.name,
      'R-RETROACTIVO',
      '2026-01-10',
    )
  } finally {
    await workerContext.close()
  }
  await page.reload()
  await expect(page.getByLabel('Grúa asignada', { exact: true })).toHaveCount(0)
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('R-RETROACTIVO')
  await expect(rows.first()).toContainText('Servicio: 10/01/2026')
  await expect(rows.first()).toContainText(replacement.name)
  await expect(rows.last()).toContainText(crane.name)
  await expect(rows.first().locator('time')).toHaveCount(1)
  const historical = await withBase(
    async (db) =>
      (
        await db.query(
          'select equipment_id,operator_id,status from public.crane_delivery_notes where id=$1',
          [firstNoteId],
        )
      ).rows[0],
  )
  expect(historical).toEqual({
    equipment_id: crane.id,
    operator_id: worker.id,
    status: 'pending',
  })
  await capture(page, info, 'detail')
  await page.goto(directoryHref)
  await assertActivityActionsFit(page)
  await capture(page, info, 'list')
})

test('segundo personal gestiona acceso y rechaza destinos de personal o administrador', async ({
  page,
  browser,
}) => {
  await login(page, otherStaff)
  await page.goto(`/crane-operators/${worker.id}`)
  for (const target of [staff, otherStaff, admin]) {
    expect(
      (await page.request.get(`/crane-operators/${target.id}`)).status(),
    ).toBe(404)
    const response = await replay(page, accessRequest, {
      userId: target.id,
      active: false,
    })
    expect(await response.text()).toContain(
      'El usuario no existe o no es un gruista',
    )
    expect(
      await withBase(
        async (db) =>
          (
            await db.query('select activo from public.profiles where id=$1', [
              target.id,
            ])
          ).rows[0].activo,
      ),
    ).toBe(true)
  }
  expect((await page.request.get('/crane-operators/no-es-uuid')).status()).toBe(
    404,
  )
  await page.getByLabel('Acceso', { exact: true }).selectOption('inactive')
  await page
    .getByRole('button', { name: 'Guardar acceso', exact: true })
    .click()
  await expect(
    page.getByText('Acceso actualizado.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Remitos enviados', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(`a[href="/delivery-notes/${latestNoteId}"]`).first(),
  ).toBeVisible()
  const workerContext = await browser.newContext()
  try {
    const workerPage = await workerContext.newPage()
    await login(workerPage, worker, 'Tu usuario todavía no está habilitado')
    await workerPage.goto('/operator/new')
    await expect(workerPage).toHaveURL(/\/sin-acceso$/)
  } finally {
    await workerContext.close()
  }
  await page.goto(`${directoryHref}&active=inactive`)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText(worker.email)
  await page.goto(`${directoryHref}&active=active`)
  await expect(
    page.getByText('No encontramos gruistas con estos filtros.', {
      exact: true,
    }),
  ).toBeVisible()
  await page.goto(`/crane-operators/${worker.id}`)
  await page.getByLabel('Acceso', { exact: true }).selectOption('active')
  await page
    .getByRole('button', { name: 'Guardar acceso', exact: true })
    .click()
  await expect(
    page.getByText('Acceso actualizado.', { exact: true }),
  ).toBeVisible()
  const reactivated = await withBase(
    async (db) =>
      (
        await db.query(
          'select p.activo,a.equipment_id from public.profiles p left join public.crane_operator_assignments a on a.user_id=p.id where p.id=$1',
          [worker.id],
        )
      ).rows[0],
  )
  expect(reactivated).toEqual({ activo: true, equipment_id: null })
  await logout(page, otherStaff)
  await login(page, worker, 'Mis remitos')
})

test('filtros y paginación conviven con las asignaciones históricas', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const roster = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      fixture.user('crane_operator', `directorio-${index}`),
    ),
  )
  await withBase((db) =>
    db.query('update public.profiles set nombre=$2 where id=$1', [
      roster[0].id,
      'Nombre muy largo de una persona encargada de la grúa '.repeat(2),
    ]),
  )
  await fixture.assign(roster[0].id, crane.id)
  await withBase((db) =>
    db.query('update public.equipos set activo=false where id=$1', [crane.id]),
  )
  await login(page, staff)
  await page.goto(directoryHref)
  await expect(page.locator('tbody tr')).toHaveCount(25)
  await page.getByRole('link', { name: 'Siguiente', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page
    .getByRole('searchbox', { name: 'Buscar gruistas' })
    .fill(worker.email)
  await page
    .locator('form[action="/crane-operators"]')
    .getByRole('button', { name: 'Buscar', exact: true })
    .click()
  await expect(page).not.toHaveURL(/page=/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.goto(
    `/crane-operators?q=${encodeURIComponent(worker.email)}&active=active&page=999999`,
  )
  await expect(page).not.toHaveURL(/page=/)
  await expect(page).toHaveURL(/active=active/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  for (const pageNumber of ['0', 'no-valida', '-1', '9999999999999999999']) {
    await page.goto(
      `/crane-operators?q=${fixture.marker}-sin-coincidencias&active=active&page=${pageNumber}`,
    )
    await expect(page).not.toHaveURL(/page=/)
    await expect(page).toHaveURL(/active=active/)
    await expect(
      page.getByText('No encontramos gruistas con estos filtros.', {
        exact: true,
      }),
    ).toBeVisible()
  }
  await page.goto(`${directoryHref}&active=active`)
  await expect(
    page.getByRole('searchbox', { name: 'Buscar gruistas' }),
  ).toHaveAttribute('placeholder', 'Nombre o email')
  await expect(
    page.getByRole('columnheader', { name: 'Grúa asignada' }),
  ).toHaveCount(0)
  await assertActivityActionsFit(page)
  await capture(page, info, 'list-long')
  await page.goto(`/crane-operators/${roster[0].id}`)
  await expect(page.getByLabel('Grúa asignada', { exact: true })).toHaveCount(0)
  await page.getByLabel('Acceso', { exact: true }).selectOption('inactive')
  await page
    .getByRole('button', { name: 'Guardar acceso', exact: true })
    .click()
  await expect(
    page.getByText('Acceso actualizado.', { exact: true }),
  ).toBeVisible()
})
