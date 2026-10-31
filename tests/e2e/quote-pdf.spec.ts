// tests/e2e/cotizacion-pdf.spec.ts
import { expect, test } from '@playwright/test'
import { withBase } from './database'
import { iniciarSession } from './helpers'

let quoteId: string

test.beforeAll(async () => {
  quoteId = await withBase(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, equipo_id, asunto, datos, notas)
       select c.id, 'jornada', e.id, 'Cotización N° {{numero}}', '{"ubicacion": "Neuquén"}', 'e2e-pdf'
       from public.clientes c, public.equipos e
       where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and e.nombre = 'Grúa telescópica XCMG QY70K-1 40 TN'
       returning id`,
    )
    await db.query(
      `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad)
       values ($1, 1, 'Precios Jornada', 'Jornada de {{capacidad}} TN', 1950000, 'JORNADA')`,
      [rows[0].id],
    )
    return rows[0].id
  })
})

test.afterAll(async () => {
  await withBase((db) => db.query(`delete from public.cotizaciones where notas = 'e2e-pdf'`))
})

test('el PDF de una cotización se sirve con su nombre de archivo y solo con sesión', async ({ page, playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL })
  const withoutSession = await anonymous.get(`/cotizaciones/${quoteId}/pdf`, { maxRedirects: 0 })
  expect(withoutSession.status()).toBe(307)
  await anonymous.dispose()

  await iniciarSession(page)
  const response = await page.request.get(`/cotizaciones/${quoteId}/pdf`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  expect(response.headers()['content-disposition']).toContain('VERTICE.pdf')
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-')

  const missing = await page.request.get(`/cotizaciones/${crypto.randomUUID()}/pdf`)
  expect(missing.status()).toBe(404)
})
