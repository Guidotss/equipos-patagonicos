// tests/e2e/cotizacion-pdf.spec.ts
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { iniciarSesion } from './helpers'

let cotizacionId: string

async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

test.beforeAll(async () => {
  cotizacionId = await conBase(async (db) => {
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
  await conBase((db) => db.query(`delete from public.cotizaciones where notas = 'e2e-pdf'`))
})

test('el PDF de una cotización se sirve con su nombre de archivo y solo con sesión', async ({ page, playwright }) => {
  const anonimo = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
  const sinSesion = await anonimo.get(`/cotizaciones/${cotizacionId}/pdf`, { maxRedirects: 0 })
  expect(sinSesion.status()).toBe(307)
  await anonimo.dispose()

  await iniciarSesion(page)
  const respuesta = await page.request.get(`/cotizaciones/${cotizacionId}/pdf`)
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toBe('application/pdf')
  expect(respuesta.headers()['content-disposition']).toContain('VERTICE.pdf')
  expect((await respuesta.body()).subarray(0, 5).toString()).toBe('%PDF-')

  const inexistente = await page.request.get(`/cotizaciones/${crypto.randomUUID()}/pdf`)
  expect(inexistente.status()).toBe(404)
})
