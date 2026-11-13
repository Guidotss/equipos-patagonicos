import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { FinanceInput } from '../../src/lib/finance/contracts'
import type { Database } from '../../src/lib/supabase/database.types'
import { createOperatorFixture } from './crane-operator-fixture'
import { E2E_EMAIL, E2E_PASSWORD } from './credentials'
import { withBase } from './database'
import { iniciarSession } from './helpers'

const fixture = createOperatorFixture()
const route = '/reports/equipment-revenue'
const title = 'Facturación por grúa'
const from = '2040-10-01'
const to = '2040-10-31'
let customer: string
let undated: string
let toReview: string
let unlinkedInvoice: string
let firstBudget: string
let secondBudget: string

function allocation(
  amount: string,
  budgetId: string | null,
  equipmentStatus: 'assigned' | 'none' | 'unknown',
  equipmentId: string | null = null,
) {
  return {
    amount,
    budgetId,
    equipmentStatus,
    equipmentId,
    historicalSettledAmount: '0',
  }
}

test.beforeAll(async () => {
  customer = await fixture.customer()
  const crane = await fixture.equipment('70 t')
  const otherCrane = await fixture.equipment('35 t')
  await withBase((db) =>
    db.query('update public.equipos set nombre = $2 where id = $1', [
      crane.id,
      'Grúa 70 t',
    ]),
  )
  await withBase((db) =>
    db.query('update public.equipos set nombre = $2 where id = $1', [
      otherCrane.id,
      'Grúa 35 t',
    ]),
  )
  firstBudget = (await fixture.budget(crane.id, 'en_curso', 'Izaje en Neuquén'))
    .id
  secondBudget = (
    await fixture.budget(otherCrane.id, 'en_curso', 'Montaje en Añelo')
  ).id
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  )
  const login = await supabase.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  })
  if (login.error) throw login.error

  async function register(
    number: string,
    amount: string,
    date: string | null,
    invoiceAllocations: NonNullable<FinanceInput['invoiceAllocations']>,
  ) {
    const path = `documentos/${customer}/${crypto.randomUUID()}.pdf`
    const upload = await supabase.storage
      .from('documentos')
      .upload(path, Buffer.from('%PDF-1.4\n%%EOF'), {
        contentType: 'application/pdf',
      })
    if (upload.error) throw upload.error
    const result = await supabase.rpc('registrar_documento', {
      p_datos: {
        cliente_id: customer,
        tipo: 'factura',
        numero: number,
        fecha: date,
        monto: amount,
        tipo_comprobante: 'FA',
        finance: { invoiceAllocations },
      },
      p_presupuestos: invoiceAllocations.flatMap((entry) =>
        entry.budgetId ? [entry.budgetId] : [],
      ),
      p_archivos: [{ path, nombre_original: `${number}.pdf` }],
    })
    if (result.error) throw result.error
    return result.data
  }

  await register('FA-ALQUILER', '1000', from, [
    allocation('600', firstBudget, 'assigned', crane.id),
    allocation('400', secondBudget, 'assigned', otherCrane.id),
  ])
  await register('FA-IZAJE', '500', to, [
    allocation('500', firstBudget, 'assigned', crane.id),
  ])
  await register('FA-TRASLADO', '200', '2040-10-15', [
    allocation('200', secondBudget, 'none'),
  ])
  toReview = await register('FA-POR-REVISAR', '300', '2040-10-21', [
    allocation('200', firstBudget, 'unknown'),
    allocation('100', null, 'unknown'),
  ])
  undated = await register('FA-SIN-FECHA', '400', null, [
    allocation('400', firstBudget, 'assigned', crane.id),
  ])
  unlinkedInvoice = await register('FA-SIN-VINCULO', '60.01', '2041-01-01', [
    allocation('60.01', null, 'unknown'),
  ])
  await register('FA-MAX-1', '999999999999.99', '2040-11-30', [
    allocation('999999999999.99', firstBudget, 'assigned', crane.id),
  ])
  await register('FA-MAX-2', '999999999999.99', '2040-11-30', [
    allocation('999999999999.99', firstBudget, 'assigned', crane.id),
  ])
  await withBase((db) =>
    db.query('update public.equipos set activo = false where id = $1', [
      otherCrane.id,
    ]),
  )
})

test.afterAll(() => fixture.cleanup())

async function filter(page: Page, from: string, to: string) {
  await page.getByLabel('Desde', { exact: true }).fill(from)
  await page.getByLabel('Hasta', { exact: true }).fill(to)
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`desde=${from}&hasta=${to}`))
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
  })
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

test('filtra el informe en escritorio y móvil y permite corregir una factura desde la revisión', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1200, height: 805 })
  await iniciarSession(page)
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true })
  await nav.getByRole('link', { name: title, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  await filter(page, from, to)
  const period = page.getByRole('region', { name: 'Total del período' })
  const undatedSection = page.getByRole('region', {
    name: 'Facturas sin fecha',
  })
  await expect(period.getByText('$ 2.000,00', { exact: true })).toBeVisible()
  await expect(period.getByText('4 facturas', { exact: true })).toBeVisible()
  await expect(
    undatedSection.getByText(/^[1-9][\d.]* facturas?$/),
  ).toBeVisible()
  for (const [name, count, amount] of [
    ['Grúa 70 t', '2', '$ 1.100,00'],
    ['Grúa 35 t', '1', '$ 400,00'],
    ['Sin equipo', '1', '$ 200,00'],
    ['Equipo desconocido', '1', '$ 200,00'],
    ['Sin distribuir', '1', '$ 100,00'],
  ]) {
    const row = period
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: new RegExp(name) }) })
    await expect(
      row.getByRole('cell', { name: count, exact: true }),
    ).toBeVisible()
    await expect(
      row.getByRole('cell', { name: amount, exact: true }),
    ).toBeVisible()
  }
  await expect(period.getByText('Inactiva', { exact: true })).toBeVisible()
  await capture(page, info, 'report-desktop')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await nav.getByRole('link', { name: title, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await filter(page, from, from)
  await expect(period.getByText('$ 1.000,00', { exact: true })).toBeVisible()
  await filter(page, from, to)
  await expect(period.getByText('$ 2.000,00', { exact: true })).toBeVisible()
  const unknown = page.getByRole('link', {
    name: 'Revisar facturas · Equipo desconocido',
    exact: true,
  })
  for (const control of [
    page.getByLabel('Desde'),
    page.getByLabel('Hasta'),
    page.getByRole('button', { name: 'Aplicar filtros' }),
    unknown,
  ]) {
    const size = await control.boundingBox()
    expect(size?.height).toBeGreaterThanOrEqual(44)
    expect(size?.width).toBeGreaterThanOrEqual(44)
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await capture(page, info, 'report-mobile')

  await unknown.focus()
  await expect(unknown).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('columnheader', { name: 'Importe por revisar' }),
  ).toBeVisible()
  await expect(page.getByLabel('Desde')).toHaveValue(from)
  await expect(page.getByLabel('Hasta')).toHaveValue(to)
  await expect(
    page.getByRole('link', { name: 'FA-POR-REVISAR' }),
  ).toHaveAttribute('href', `/documentos/${toReview}`)
  await expect(
    page.getByRole('cell', { name: '$ 200,00', exact: true }),
  ).toBeVisible()
  await capture(page, info, 'review-mobile')
  await page
    .getByRole('link', { name: 'Volver al informe', exact: true })
    .click()
  await page
    .getByRole('link', {
      name: 'Revisar facturas · Sin distribuir',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('cell', { name: '$ 100,00', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Volver al informe', exact: true })
    .click()

  await expect(period).toBeVisible()
  await filter(page, to, from)
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Desde debe ser anterior o igual a Hasta.',
  )
  await expect(page.getByLabel('Desde')).toHaveValue(to)
  await expect(page.getByLabel('Hasta')).toHaveValue(from)
  await filter(page, '2040-11-30', '2040-11-30')
  const maximum = '$ 1.999.999.999.999,98'
  await expect(
    period.getByRole('paragraph').filter({ hasText: maximum }),
  ).toBeVisible()
  await expect(
    period.getByRole('table').getByText(maximum, { exact: true }),
  ).toBeVisible()
  expect(
    await period.getByRole('table').evaluate((table) => {
      const container = table.parentElement!
      return container.scrollWidth <= container.clientWidth
    }),
  ).toBe(true)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)

  await filter(page, '2040-12-01', '2040-12-01')
  await expect(
    period.getByText('No hay facturas con fecha en este período.'),
  ).toBeVisible()
  const reviewUndated = undatedSection.getByRole('link', {
    name: 'Revisar facturas · Facturas sin fecha',
    exact: true,
  })
  await expect(reviewUndated).toBeVisible()
  await capture(page, info, 'empty-mobile')
  await reviewUndated.click()
  const invoice = page.getByRole('link', { name: 'FA-SIN-FECHA', exact: true })
  const undatedRow = page.getByRole('row').filter({ has: invoice })
  await expect(
    undatedRow.getByRole('cell', { name: 'Sin fecha', exact: true }),
  ).toBeVisible()
  await expect(
    undatedRow.getByRole('cell', { name: '$ 400,00', exact: true }),
  ).toBeVisible()
  await expect(invoice).toHaveAttribute('href', `/documentos/${undated}`)
  await invoice.click()
  await expect(page).toHaveURL(new RegExp(`/documentos/${undated}$`))
  await expect(
    page.getByRole('heading', {
      name: 'Factura · FA FA-SIN-FECHA',
      exact: true,
    }),
  ).toBeVisible()
  const issueDate = page.getByLabel('Fecha (opcional)', { exact: true })
  await expect(issueDate).toHaveValue('')
  await issueDate.fill(from)
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${firstBudget}$`))
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await nav.getByRole('link', { name: title, exact: true }).click()
  await filter(page, from, to)
  await expect(period.getByText('$ 2.400,00', { exact: true })).toBeVisible()
  await expect(period.getByText('5 facturas', { exact: true })).toBeVisible()
  await page.goto(`${route}?desde=${from}&hasta=${to}&revisar=undated`)
  const undatedReview = page.getByRole('region', {
    name: 'Facturas sin fecha',
  })
  await expect(undatedReview).toBeVisible()
  await expect(
    undatedReview.getByRole('link', { name: 'FA-SIN-FECHA', exact: true }),
  ).toHaveCount(0)
})

test('corrige desde Sin distribuir la fecha de una factura existente sin vínculo', async ({
  page,
}) => {
  await iniciarSession(page)
  await page.goto(`${route}?desde=2041-01-01&hasta=2041-01-01`)
  await page
    .getByRole('link', {
      name: 'Revisar facturas · Sin distribuir',
      exact: true,
    })
    .click()
  await page.getByRole('link', { name: 'FA-SIN-VINCULO', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/documentos/${unlinkedInvoice}$`))
  const issueDate = page.getByLabel('Fecha (opcional)', { exact: true })
  await expect(issueDate).toHaveValue('2041-01-01')
  await expect(
    page
      .getByRole('group', { name: 'Presupuestos vinculados' })
      .getByRole('checkbox', { checked: true }),
  ).toHaveCount(0)
  await issueDate.fill('2041-01-02')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click({ timeout: 4000 })
  await expect(page).toHaveURL(/\/presupuestos$/)

  const rows = await withBase(
    async (db) =>
      (
        await db.query(
          `select d.fecha::text, d.financial_version,
    (select count(*)::int from public.documento_presupuestos p where p.documento_id = d.id) as links
    from public.documentos d where d.id = $1`,
          [unlinkedInvoice],
        )
      ).rows,
  )
  expect(rows).toEqual([
    { fecha: '2041-01-02', financial_version: '2', links: 0 },
  ])
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('link', { name: title, exact: true })
    .click()
  await filter(page, '2041-01-01', '2041-01-02')
  await page
    .getByRole('link', {
      name: 'Revisar facturas · Sin distribuir',
      exact: true,
    })
    .click()
  const row = page.getByRole('row').filter({
    has: page.getByRole('link', { name: 'FA-SIN-VINCULO', exact: true }),
  })
  await expect(
    row.getByRole('cell', { name: '02/01/2041', exact: true }),
  ).toBeVisible()
  await expect(
    row.getByRole('cell', { name: '$ 60,01', exact: true }),
  ).toBeVisible()
})

test('protege la ruta comercial y oculta la navegación al gruista', async ({
  page,
}) => {
  const guarded = `${route}?desde=invalida&revisar=unknown`
  await page.goto(guarded)
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toHaveCount(0)
  const worker = await fixture.user('crane_operator', 'facturacion')
  await page.getByLabel('Email', { exact: true }).fill(worker.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(worker.password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page).toHaveURL(/\/operator$/)
  await page.goto(guarded)
  await expect(page).toHaveURL(/\/operator$/)
  await expect(
    page.getByRole('link', { name: title, exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toHaveCount(0)
})
