import { createElement } from 'react'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { conBase, crearCotizacionCompleta } from './base-datos'
import { iniciarSesion } from './helpers'

const marca = `Cierre E2E ${crypto.randomUUID().slice(0, 8)}`
let cliente: string
let otro: string
let base: string
let numero: number
test.beforeAll(async () => {
  await conBase(async (db) => {
    const { rows } = await db.query('insert into public.clientes(razon_social) values($1),($2) returning id', [marca, `${marca} otro`])
    cliente = rows[0].id; otro = rows[1].id
    const cot = await db.query("insert into public.cotizaciones(cliente_id,formato,asunto,notas) values($1,'jornada',$2,$3) returning id", [cliente, `Trabajo base ${marca}`, marca])
    base = cot.rows[0].id
    const n = await db.query('select n from generate_series(80000,90000) n where not exists(select 1 from public.cotizaciones c where c.numero=n) limit 1')
    numero = n.rows[0].n
  })
})
test.afterAll(async () => {
  await conBase(async (db) => {
    const { rows } = await db.query('select archivo_original_path from public.cotizaciones where cliente_id=any($1::uuid[]) and archivo_original_path is not null', [[cliente, otro]])
    if (rows.length) {
      process.loadEnvFile('.env.local')
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
      await admin.storage.from('documentos').remove(rows.map((r) => r.archivo_original_path))
    }
    await db.query('delete from public.cotizaciones where cliente_id=any($1::uuid[])', [[cliente, otro]])
    await db.query('delete from public.plantillas where nombre like $1', [`${marca}%`])
    await db.query('delete from public.clientes where id=any($1::uuid[])', [[cliente, otro]])
  })
})

test('carga un PDF con su número original, conserva el archivo y permite seguimiento', async ({ page }) => {
  const pdf = await renderToBuffer(createElement(Document, {}, createElement(Page, {}, createElement(Text, {}, 'Cotizacion original de Equipos Patagonicos'))))
  await iniciarSesion(page)
  await page.goto('/cotizaciones/cargar')
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(marca)
  await page.getByRole('option', { name: marca, exact: true }).click()
  await page.getByLabel('Número original').fill(String(numero))
  await page.getByLabel('Descripción del trabajo').fill(`Importada ${marca}`)
  await page.getByLabel('Archivo PDF').setInputFiles({ name: 'cotizacion.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByRole('button', { name: 'Cargar cotización', exact: true }).click()
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `Cotización N° ${numero}` })).toBeVisible()
  const respuesta = await page.request.get(new URL('pdf', `${page.url()}/`).href)
  expect(respuesta.headers()['content-type']).toContain('application/pdf')
  expect(await respuesta.body()).toEqual(pdf)
  await page.getByLabel('Notas internas').fill(marca)
  await page.getByLabel('Próxima actualización de tarifa').fill('2026-11-20')
  await page.getByRole('button', { name: 'Guardar seguimiento' }).click()
  await expect(page.getByText('Seguimiento guardado', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Próxima actualización de tarifa')).toHaveValue('2026-11-20')
  await page.goto(`${page.url()}?accion=rechazar`)
  const confirmacion = page.getByRole('group', { name: '¿Rechazar esta cotización?' })
  await expect(confirmacion).toBeVisible()
  await confirmacion.getByRole('button', { name: 'Cancelar', exact: true }).click()
})

test('guarda una plantilla desde el editor y edita sus textos sin crear una cotización', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto(`/cotizaciones/nueva?cliente=${cliente}`)
  await page.getByRole('button', { name: 'Guardar como plantilla', exact: true }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre de la plantilla').fill(`${marca} plantilla`)
  await dialogo.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(dialogo).toBeHidden()
  const id = await conBase(async (db) => (await db.query('select id from public.plantillas where nombre=$1', [`${marca} plantilla`])).rows[0].id)
  await page.goto(`/configuracion/plantillas/${id}/editar`)
  await expect(page.getByLabel('Precio del ítem 1', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Los precios se completan en cada cotización.')).toBeVisible()
  await page.getByLabel('Cantidad del ítem 1', { exact: true }).fill('2')
  await page.getByLabel('Asunto', { exact: true }).fill('Plantilla editada {{ubicacion}}')
  await page.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion\/plantillas$/)
  await page.goto(`/configuracion/plantillas/${id}/editar`)
  await expect(page.getByLabel('Asunto', { exact: true })).toHaveValue('Plantilla editada {{ubicacion}}')
  await expect(page.getByLabel('Cantidad del ítem 1', { exact: true })).toHaveValue('2')
})

test('los formularios especiales señalan cada error y enfocan el primer campo pendiente', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/directo')
  await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click()
  const selector = page.getByRole('combobox', { name: 'Cliente', exact: true })
  await expect(selector).toBeFocused()
  await expect(selector).toHaveAccessibleDescription('Elegí el cliente')
  await expect(page.getByLabel('Descripción del trabajo')).toHaveAccessibleDescription('Describí el trabajo')
  await expect(page.getByLabel('Fecha de aprobación')).toHaveAccessibleDescription('Si queda vacía, se usa la fecha del trabajo.')

  await page.goto('/cotizaciones/cargar')
  await page.getByRole('button', { name: 'Cargar cotización', exact: true }).click()
  await expect(page.getByLabel('Archivo PDF')).toHaveAccessibleDescription('Un archivo PDF de hasta 10 MB. Elegí el PDF de la cotización')
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(marca)
  await page.getByRole('option', { name: marca, exact: true }).click()
  await page.getByLabel('Número original').fill(String(numero))
  await page.getByRole('button', { name: 'Cargar cotización', exact: true }).click()
  await expect(page.getByLabel('Archivo PDF')).toBeFocused()
  await expect(page.getByLabel('Número original')).toHaveValue(String(numero))
})

test('basa una nueva en la última y duplica a otro cliente', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto(`/cotizaciones/nueva?cliente=${cliente}`)
  await page.getByRole('button', { name: 'Basar en la última cotización', exact: true }).click()
  await page.getByRole('button', { name: 'Usar última cotización', exact: true }).click()
  await expect(page.getByLabel('Asunto', { exact: true })).toHaveValue(`Trabajo base ${marca}`)
  await page.goto(`/cotizaciones?q=${encodeURIComponent(`Trabajo base ${marca}`)}`)
  const fila = page.getByRole('row').filter({ hasText: `Trabajo base ${marca}` })
  await fila.getByRole('button', { name: /Más acciones/ }).click()
  await page.getByRole('menuitem', { name: 'Duplicar a otro cliente' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByRole('combobox', { name: 'Cliente de la nueva cotización' }).click()
  await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(`${marca} otro`)
  await page.getByRole('option', { name: `${marca} otro`, exact: true }).click()
  await dialogo.getByRole('button', { name: 'Crear borrador para este cliente' }).click()
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('combobox', { name: 'Cliente', exact: true })).toContainText(`${marca} otro`)
  expect(page.url()).not.toContain(base)
})

test('preparar una OC guarda los cambios y bloquea contenido y acciones durante un guardado lento', async ({ page }) => {
  const id = await conBase(async (db) => {
    const c = await crearCotizacionCompleta(db)
    await db.query("update public.cotizaciones set cliente_id=$2, estado='enviada', notas=$3 where id=$1", [c.id, cliente, marca])
    return c.id
  })
  await iniciarSesion(page)
  await page.goto(`/cotizaciones/${id}`)
  const asunto = page.getByLabel('Asunto', { exact: true })
  await asunto.fill(`OC con contenido nuevo ${marca}`)
  let liberar!: () => void
  let recibida!: () => void
  const puerta = new Promise<void>((r) => { liberar = r })
  const solicitud = new Promise<void>((r) => { recibida = r })
  await page.route(`**/cotizaciones/${id}`, async (ruta) => {
    if (ruta.request().method() === 'POST') { recibida(); await puerta }
    await ruta.continue()
  })
  await page.getByRole('button', { name: 'Aprobar y cargar orden de compra', exact: true }).click()
  await solicitud
  await expect(asunto).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled()
  liberar()
  await expect(page).toHaveURL(/\/documentos\/nuevo\?cotizacion=/)
  expect(new URL(page.url()).searchParams.get('version')).toBeTruthy()
  const guardada = await conBase(async (db) => (await db.query('select asunto,estado from public.cotizaciones where id=$1', [id])).rows[0])
  expect(guardada).toEqual({ asunto: `OC con contenido nuevo ${marca}`, estado: 'enviada' })
})
