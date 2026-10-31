import { expect, test } from '@playwright/test'
import { iniciarSesion, sufijoUnico } from './helpers'
import { conBase } from './base-datos'

const clientesCreados: string[] = []

test.afterEach(async () => {
  await conBase(async (db) => {
    await db.query('delete from public.clientes where razon_social = any($1::text[])', [clientesCreados])
  })
  clientesCreados.length = 0
})

test('alta de cliente: acepta el CUIT informado, conserva errores de email y permite editarlo', async ({ page }) => {
  const sufijo = sufijoUnico()
  const razonSocial = `Grúas Ñandú ${sufijo} S.A.`
  clientesCreados.push(razonSocial)

  await iniciarSesion(page)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('link', { name: 'Nuevo cliente' }).click()

  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByLabel('CUIT').fill('30-71952967-1')
  await page.getByLabel('Email', { exact: true }).fill('correo-incorrecto')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('El email no es válido')).toBeVisible()
  await expect(page.getByLabel('Razón social')).toHaveValue(razonSocial)
  await expect(page.getByLabel('CUIT')).toHaveValue('30-71952967-1')

  await page.getByLabel('Email', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/)
  const ficha = page.url()
  await expect(page.getByLabel('CUIT')).toHaveValue('30-71952967-1')
  const informado = 'Identificación informada por el cliente'
  await page.getByLabel('CUIT').fill(informado)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  const clienteId = ficha.split('/').at(-1)!
  await expect.poll(() => conBase(async (db) => (
    await db.query<{ cuit: string }>('select cuit from public.clientes where id=$1', [clienteId])
  ).rows[0].cuit)).toBe(informado)
  await page.reload()
  await expect(page.getByLabel('CUIT')).toHaveValue(informado)

  await page.getByRole('link', { name: 'Agregar contacto' }).click()
  await expect(page).toHaveURL(`${ficha}/contactos/nuevo`)
  await page.getByLabel('Nombre').fill('Yanina Colman')
  await page.getByLabel('Email').fill('yanina@ejemplo.com')
  await page.getByRole('button', { name: 'Guardar contacto' }).click()
  // Esperar la ficha: en el alta la vista previa de la cotización también muestra el nombre.
  await expect(page).toHaveURL(ficha)
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()
  await expect(page.getByText('Yanina Colman')).toBeVisible()

  await page.goto(`/clientes?q=${encodeURIComponent(`gruas nandu ${sufijo}`)}`)
  await expect(page.getByRole('link', { name: razonSocial, exact: true })).toBeVisible()
})

test('el CUIT de un cliente existente no se puede repetir', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  const razonSocial = `Duplicado ${sufijoUnico()}`
  clientesCreados.push(razonSocial)
  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByLabel('CUIT').fill('30-71952967-0')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('Ya existe un cliente con ese CUIT').first()).toBeVisible()
})

test('un cliente se puede desactivar y volver a activar', async ({ page }) => {
  const razonSocial = `Para desactivar ${sufijoUnico()}`
  clientesCreados.push(razonSocial)
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()

  await page.getByRole('button', { name: `Desactivar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeVisible()
  await page.getByRole('button', { name: `Activar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeHidden()
})

test('la navegación de formularios admite razones sociales largas en móvil', async ({ page }) => {
  const nombre = `Ingeniería, Servicios y Montajes Industriales de la Patagonia ${sufijoUnico()} S.R.L.`
  const id = await conBase(async (db) => (
    await db.query('insert into public.clientes(razon_social) values($1) returning id', [nombre])
  ).rows[0].id as string)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await iniciarSesion(page)
    await page.goto(`/clientes/${id}/contactos/nuevo`)
    await expect(page.getByRole('heading', { name: 'Nuevo contacto', exact: true })).toBeVisible()
    const medidas = await page.evaluate(() => ({
      disponible: window.innerWidth,
      contenido: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }))
    expect(medidas.contenido).toBeLessThanOrEqual(medidas.disponible)
    const guardar = await page.getByRole('button', { name: 'Guardar contacto', exact: true }).boundingBox()
    expect(guardar).not.toBeNull()
    expect(guardar!.x + guardar!.width).toBeLessThanOrEqual(medidas.disponible)
  } finally {
    await conBase(async (db) => { await db.query('delete from public.clientes where id=$1', [id]) })
  }
})
