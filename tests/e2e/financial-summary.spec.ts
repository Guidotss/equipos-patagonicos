import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { validateEnvTests } from '../../scripts/test-env.mjs'
import { withBase } from './database'
import { E2E_EMAIL, E2E_PASSWORD } from './credentials'
import { iniciarSession } from './helpers'

const marker = `resumen-financiero-${crypto.randomUUID()}`
let clientId: string
let budgetIds: string[]
let paymentId: string
const paths: string[] = []

const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })

test.beforeAll(async () => {
  validateEnvTests()
  clientId = await withBase(async (db) => (await db.query<{ id: string }>('insert into public.clientes (razon_social) values ($1) returning id', [marker])).rows[0].id)
  budgetIds = await withBase(async (db) => (await db.query<{ id: string }>(`insert into public.cotizaciones (cliente_id, origen, formato, asunto, notas, estado, fecha_aprobacion, presupuesto_estado)
    select $1, 'directa', 'jornada', $2 || n, $2, 'aprobada', current_date, 'en_curso' from generate_series(1,3) n returning id`, [clientId, marker])).rows.map((row) => row.id))
  const supabase = client()
  const login = await supabase.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD })
  if (login.error) throw login.error
  async function register(type: 'factura' | 'orden_pago', amount: string, budget: string, finance: object, number: string) {
    const path = `documentos/${clientId}/${crypto.randomUUID()}.pdf`
    paths.push(path)
    const upload = await supabase.storage.from('documentos').upload(path, Buffer.from('%PDF-1.4\n%%EOF'), { contentType: 'application/pdf' })
    if (upload.error) throw upload.error
    const result = await supabase.rpc('registrar_documento', { p_datos: { cliente_id: clientId, tipo: type, numero: number, monto: amount, tipo_comprobante: type === 'factura' ? 'FA' : null, finance }, p_presupuestos: [budget], p_archivos: [{ path, nombre_original: `${number}.pdf` }] })
    if (result.error) throw result.error
    return result.data
  }
  const invoice = await register('factura', '1000', budgetIds[0], { invoiceAllocations: [{ budgetId: budgetIds[0], equipmentId: null, equipmentStatus: 'unknown', amount: '1000', historicalSettledAmount: '0' }] }, 'FA-SUM')
  const cash = crypto.randomUUID(), withholding = crypto.randomUUID(), check = crypto.randomUUID()
  const instrument = (id: string, kind: string, status: string, amount: string) => ({ id, kind, status, amount, receivedOn: null, dueOn: null, settledOn: status === 'confirmed' ? '2024-06-20' : null, reference: '', bank: '' })
  paymentId = await register('orden_pago', '550', budgetIds[0], { paymentInstruments: [instrument(cash, 'cash', 'confirmed', '400'), instrument(withholding, 'withholding', 'confirmed', '50'), instrument(check, 'check', 'pending', '100')], paymentAllocations: [cash, withholding, check].map((id, index) => ({ instrumentId: id, budgetId: budgetIds[0], invoiceId: invoice, amount: ['400', '50', '100'][index] })) }, 'OP-SUM')
  const advance = crypto.randomUUID()
  await register('orden_pago', '100', budgetIds[1], { paymentInstruments: [instrument(advance, 'cash', 'confirmed', '100')], paymentAllocations: [{ instrumentId: advance, budgetId: budgetIds[1], invoiceId: null, amount: '100' }] }, 'OP-CRED')
  await register('factura', '200', budgetIds[2], { invoiceAllocations: [{ budgetId: null, equipmentId: null, equipmentStatus: 'unknown', amount: '200', historicalSettledAmount: '0' }] }, 'FA-PEND')
})

test.afterAll(async () => {
  validateEnvTests()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  if (paths.length) { const result = await admin.storage.from('documentos').remove(paths); if (result.error) throw result.error }
  await withBase(async (db) => {
    await db.query('begin')
    try {
      await db.query('set local session_replication_role = replica')
      await db.query('delete from public.financial_events where document_id in (select id from public.documentos where cliente_id = $1)', [clientId])
      await db.query('delete from public.payment_allocations where instrument_id in (select id from public.payment_instruments where op_id in (select id from public.documentos where cliente_id = $1))', [clientId])
      await db.query('delete from public.payment_instruments where op_id in (select id from public.documentos where cliente_id = $1)', [clientId])
      await db.query('delete from public.invoice_allocations where invoice_id in (select id from public.documentos where cliente_id = $1)', [clientId])
      await db.query('set local session_replication_role = origin')
      await db.query('delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1) or factura_id in (select id from public.documentos where cliente_id = $1)', [clientId])
      await db.query('delete from public.documentos where cliente_id = $1', [clientId])
      await db.query('delete from public.cotizaciones where cliente_id = $1', [clientId])
      await db.query('delete from public.clientes where id = $1', [clientId])
      await db.query('commit')
    } catch (error) { await db.query('rollback'); throw error }
  })
})

test('resumen exacto y anulación y restauración con motivo', async ({ page }, testInfo) => {
  await iniciarSession(page)
  await page.goto(`/presupuestos/${budgetIds[0]}`)
  const summary = page.getByRole('region', { name: 'Resumen financiero' })
  await expect(summary).toContainText('Facturado$ 1.000,00')
  await expect(summary).toContainText('Cancelado$ 450,00')
  await expect(summary).toContainText('Cheques pendientes$ 100,00')
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 550,00')
  await page.setViewportSize({ width: 1200, height: 805 })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('resumen-desktop.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('resumen-mobile.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const stalePage = await page.context().newPage()
  await stalePage.goto(`/presupuestos/${budgetIds[0]}`)
  const stalePayment = stalePage.locator('[data-documento]').filter({ hasText: 'OP-SUM' })
  await expect(stalePayment.getByRole('button', { name: 'Anular', exact: true })).toBeVisible()
  const payment = page.locator('[data-documento]').filter({ hasText: 'OP-SUM' })
  await payment.getByRole('button', { name: 'Anular', exact: true }).click()
  await expect(payment.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled()
  await payment.getByLabel('Motivo').fill('Error en el comprobante')
  await payment.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 1.000,00')
  await stalePayment.getByRole('button', { name: 'Anular', exact: true }).click()
  await stalePayment.getByLabel('Motivo').fill('Intento con versión anterior')
  await stalePayment.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(stalePayment.getByRole('alert')).toBeVisible()
  await stalePage.close()
  await payment.getByRole('button', { name: 'Restaurar' }).click()
  await payment.getByLabel('Motivo').fill('Comprobante verificado')
  await payment.getByRole('button', { name: 'Confirmar restauración' }).click()
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('$ 550,00')
  const record = await withBase(async (db) => (await db.query<{ financial_version: string; deleted_at: string | null }>('select financial_version, deleted_at from public.documentos where id = $1', [paymentId])).rows[0])
  expect(Number(record.financial_version)).toBe(3)
  expect(record.deleted_at).toBeNull()
  await page.goto(`/presupuestos/${budgetIds[1]}`)
  await expect(page.getByRole('region', { name: 'Resumen financiero' })).toContainText('Crédito a favor$ 100,00')
  await expect(page.getByText('Incluye anticipos')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('resumen-credito-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.goto(`/presupuestos/${budgetIds[2]}`)
  await expect(page.getByTestId('saldo-presupuesto')).toHaveText('Saldo pendiente de distribución')
  await expect(page.getByRole('region', { name: 'Resumen financiero' }).getByRole('link', { name: 'FA-PEND' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('resumen-indeterminado-mobile.png'), fullPage: true, animations: 'disabled' })
})
